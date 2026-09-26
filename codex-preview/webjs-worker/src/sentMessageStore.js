'use strict';

const logger = require('./logger');

// ============================================================================
// sentMessageStore — memória das mensagens que ENVIAMOS, pro reenvio automático
// ----------------------------------------------------------------------------
// BUG REAL DE PRODUÇÃO (2026-09-04, reportado pelo dono com print): mensagem
// da IA chegava no celular do cliente como "Aguardando mensagem. Essa ação
// pode levar alguns instantes." PARA SEMPRE -- nunca virava texto, mesmo com
// o nosso lado confirmando envio com sucesso (`meta_status: 'sent'`, id do
// WhatsApp preenchido).
//
// CAUSA RAIZ (achada lendo o código do Baileys, não por tentativa e erro):
// quando o celular do destinatário não consegue descriptografar, ele MANDA UM
// PEDIDO DE REENVIO automático de volta ("retry receipt") -- é assim que o
// WhatsApp se autocura entre dois celulares normais. O Baileys trata isso em
// `sendMessagesAgain()` (Socket/messages-recv.js), que chama a função
// `getMessage(key)` do config pra buscar o CONTEÚDO ORIGINAL e reencriptar
// com uma sessão nova.
//
// O default do Baileys é `getMessage: async () => undefined` -- ou seja: sem
// implementar isso, respondemos "não tenho essa mensagem", o Baileys loga
// `'recv retry request, but message not available'` e DESISTE. A mensagem
// fica travada no cliente pra sempre.
//
// Por isso apagar a conversa / reconectar via QR nunca resolvia: o WhatsApp
// estava tentando se curar sozinho e a gente é que não respondia.
//
// Este módulo guarda em memória o conteúdo de tudo que mandamos (id do
// WhatsApp -> conteúdo), com teto de tamanho e expiração, pra conseguir
// responder esse pedido. Memória (não banco) de propósito: o pedido de
// reenvio chega em segundos, precisa ser rápido, e o Baileys já limita a
// quantidade de retries por mensagem (`maxMsgRetryCount`). Existe fallback
// no banco pra sobreviver a restart do worker (ver getMessageForRetry).
// ============================================================================

// Teto de memória: 1000 mensagens (~algumas centenas de KB no pior caso) --
// o suficiente pra cobrir picos de disparo em massa sem crescer sem limite.
const MAX_ENTRIES = 1000;
// 24h: o WhatsApp pode pedir reenvio bem depois do envio original (celular
// desligado, sem sinal, app fechado). Mais generoso que a 1h do cache de
// retry do próprio Baileys, de propósito.
const TTL_MS = 24 * 60 * 60 * 1000;

// Map preserva ordem de inserção -- usado pra descartar o mais antigo quando
// estoura o teto (FIFO simples; não precisa de LRU real aqui).
const store = new Map(); // waMessageId -> { content, savedAt }

function remember(waMessageId, content) {
  if (!waMessageId || typeof content !== 'string' || content === '') return;
  // Re-inserir move pro fim (mais recente) -- delete antes do set.
  if (store.has(waMessageId)) store.delete(waMessageId);
  store.set(waMessageId, { content, savedAt: Date.now() });

  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

function getFromMemory(waMessageId) {
  if (!waMessageId) return null;
  const entry = store.get(waMessageId);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) {
    store.delete(waMessageId);
    return null;
  }
  return entry.content;
}

// Fallback no banco: sobrevive a restart do worker (memória zera, mas a
// mensagem continua gravada em `messages` com o webjs_message_id). Cobre o
// caso real de "worker reiniciou no meio da conversa e o cliente pediu
// reenvio depois". Nunca lança -- falha aqui só significa "não consegui
// reenviar", nunca derrubar o processo.
async function getFromDatabase(supabase, waMessageId) {
  if (!supabase || !waMessageId) return null;
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('content, content_type')
      .eq('webjs_message_id', waMessageId)
      .eq('direction', 'outbound')
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Só texto: mídia outbound ainda não é suportada no canal webjs, e
    // reenviar mídia exigiria re-upload (não é só reencriptar o texto).
    if (data.content_type && data.content_type !== 'text') return null;
    return typeof data.content === 'string' && data.content !== '' ? data.content : null;
  } catch (err) {
    logger.warn('sentMessageStore: falha ao buscar mensagem no banco pra reenvio', {
      message: err?.message,
    });
    return null;
  }
}

// Passada como `getMessage` no makeWASocket. O Baileys chama isso quando o
// celular do destinatário pede reenvio. Retorno esperado: um objeto de
// mensagem do protocolo (proto.IMessage) -- pra texto puro, `{ conversation }`.
// Retornar undefined = "não tenho" (comportamento antigo, mensagem trava).
function makeGetMessage(supabase) {
  return async function getMessageForRetry(key) {
    try {
      const waMessageId = key?.id;
      if (!waMessageId) return undefined;

      let content = getFromMemory(waMessageId);
      if (!content) {
        content = await getFromDatabase(supabase, waMessageId);
      }
      if (!content) {
        logger.warn('Pedido de reenvio recebido mas mensagem não encontrada', {
          waMessageId,
          jid: key?.remoteJid,
        });
        return undefined;
      }

      // Marca esse destino como "problemático": a próxima mensagem pra ele
      // vai forçar sessão nova ANTES de enviar, em vez de falhar e só depois
      // se curar via reenvio (ver markProblematic/shouldForceSession).
      if (key?.remoteJid) markProblematic(key.remoteJid);

      logger.info('Reenviando mensagem a pedido do WhatsApp do destinatário', {
        waMessageId,
        jid: key?.remoteJid,
      });
      return { conversation: content };
    } catch (err) {
      // Nunca deixa uma falha aqui derrubar o socket -- pior caso volta ao
      // comportamento antigo (mensagem travada), nunca queda do worker.
      logger.error('sentMessageStore: erro em getMessage (ignorado)', { message: err?.message });
      return undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// Destinos problemáticos: quem já pediu reenvio recentemente
// ---------------------------------------------------------------------------
// Reenviar CURA a mensagem, mas leva ~2 minutos (o celular só pede de novo
// depois de um tempo) -- e nesse meio tempo o cliente vê "Aguardando
// mensagem". Pra conversa de venda isso é ruim demais.
//
// Solução: lembrar quem já falhou e, na PRÓXIMA mensagem pra esse destino,
// forçar uma sessão de criptografia nova ANTES de enviar
// (`sock.assertSessions([jid], true)`) -- é exatamente o que o Baileys faz
// no reenvio, só que fazendo antes evita a falha em vez de remediar depois.
//
// Só pra quem JÁ deu problema, de propósito: forçar sessão em toda mensagem
// geraria tráfego extra desnecessário em conversa saudável (e tráfego
// atípico é justamente o que aumenta risco de bloqueio no disparo em massa).
const PROBLEMATIC_TTL_MS = 6 * 60 * 60 * 1000; // 6h sem falhar = considera curado
const MAX_PROBLEMATIC = 500;
const problematic = new Map(); // jid -> timestamp da última falha

function markProblematic(jid) {
  if (!jid || typeof jid !== 'string') return;
  if (problematic.has(jid)) problematic.delete(jid);
  problematic.set(jid, Date.now());
  while (problematic.size > MAX_PROBLEMATIC) {
    const oldest = problematic.keys().next().value;
    if (oldest === undefined) break;
    problematic.delete(oldest);
  }
}

function shouldForceSession(jid) {
  if (!jid || typeof jid !== 'string') return false;
  const at = problematic.get(jid);
  if (!at) return false;
  if (Date.now() - at > PROBLEMATIC_TTL_MS) {
    problematic.delete(jid);
    return false;
  }
  return true;
}

// Força sessão nova antes de enviar, quando esse destino já deu problema.
// Nunca lança: se falhar, seguimos com o envio normal (pior caso é o
// comportamento de antes -- falha e cura via reenvio).
async function forceFreshSessionIfNeeded(sock, jid) {
  if (!shouldForceSession(jid)) return false;
  try {
    if (typeof sock?.assertSessions !== 'function') return false;
    await sock.assertSessions([jid], true);
    logger.info('Sessão de criptografia renovada antes do envio (destino já falhou antes)', { jid });
    return true;
  } catch (err) {
    logger.warn('Falha ao renovar sessão antes do envio (seguindo mesmo assim)', {
      jid,
      message: err?.message,
    });
    return false;
  }
}

function stats() {
  return {
    size: store.size,
    maxEntries: MAX_ENTRIES,
    ttlMs: TTL_MS,
    problematicJids: problematic.size,
  };
}

// Exportado pra teste -- não usar em produção.
function _reset() {
  store.clear();
  problematic.clear();
}

module.exports = {
  remember,
  makeGetMessage,
  getFromMemory,
  markProblematic,
  shouldForceSession,
  forceFreshSessionIfNeeded,
  stats,
  _reset,
};
