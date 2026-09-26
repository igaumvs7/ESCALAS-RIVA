'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const { wrapSocket, classifyDisconnect, JidCanonicalizer } = require('baileys-antiban');
const sentMessageStore = require('./sentMessageStore');
const pino = require('pino');
const QRCode = require('qrcode');
const logger = require('./logger');
const { handleIncomingMessages } = require('./inbound');

// BUG REAL #2 encontrado em produção (2026-08-27, mesmo dia do bug do 515):
// classifyDisconnect() da baileys-antiban categoriza 428 (connectionClosed —
// Baileys' PRÓPRIO nome pra isso: só "a conexão fechou", o motivo mais
// genérico e comum que existe — queda de wifi do celular, app em segundo
// plano, etc.) como categoria 'fatal', E MISTURA a mensagem dele com a de
// 440 (connectionReplaced, esse sim "outro aparelho assumiu"), retornando o
// texto "Connection replaced — another device took over" pra AMBOS os
// códigos. Resultado real: o dono teve uma queda de conexão comum
// classificada como bloqueio de 24h, com uma mensagem enganosa. Confirmado
// lendo node_modules/baileys-antiban/dist/sessionStability.js diretamente
// (linhas ~21 e ~47) — não é boato, é bug de verdade na lib.
//
// Diante de 3 misclassificações confirmadas na mesma função em 1 dia (515,
// e agora 428/440), paramos de confiar na categoria 'fatal'/'rate-limited'
// dela pra decidir bloqueio. `classifyDisconnect` continua sendo consultado
// só pelo `backoffMs` sugerido (tempo de espera pra reconectar), nunca mais
// pra decidir SE é bloqueio. A única fonte de bloqueio automático agora é:
// (1) aqui: o código 403 (forbidden) isolado — o único sinal com consenso
//     real da comunidade Baileys pra restrição de spam, documentado direto
//     no enum DisconnectReason do próprio Baileys;
// (2) campaignWorker.js: risco acumulado (403/463/desconexões repetidas)
//     via sock.antiban.getStats().health.risk — camada independente, não
//     depende de classifyDisconnect.
// Qualquer outro código (401 logout, 408/1000 timeout, 411 mismatch, 412
// precondition, 428 closed, 429/503 rate-limit real, 440 replaced, 500 bad
// session, 515 restart) agora sempre RECONECTA sozinho — se a credencial
// realmente não for mais válida, o próprio Baileys pede QR novo na hora (o
// handler de 'qr' já trata isso), sem precisar de 24h de espera artificial.
const BLOCK_STATUS_CODES = new Set([403]);

// orgId -> { sock, saveCreds } — cada org ativa tem seu próprio socket
// Baileys (conexão WebSocket direta, sem navegador — é o que faz isso ser
// tão mais leve que o whatsapp-web.js antigo).
const sessions = new Map();

// orgId -> true enquanto estamos tentando reconectar (aguardando o timeout
// de 5s) OU foi parado de propósito. Evita duas coisas ao mesmo tempo:
// (1) o sync de 15s do index.js chamar startSession de novo enquanto já tem
//     uma reconexão agendada pro mesmo orgId (criaria 2 sockets brigando
//     pelo mesmo arquivo de sessão);
// (2) stopSession() (desconexão manual) disparar o evento 'close' do
//     próprio Baileys e cair sem querer no fluxo de "reconectar sozinho".
const reconnecting = new Set();
const intentionallyStopped = new Set();

// Baileys exige um logger; normalmente silenciamos o dele e usamos o nosso
// (logger.js). BAILEYS_LOG_LEVEL permite ligar o log interno dele sem mexer
// no código -- essencial pra diagnosticar problema de criptografia/entrega
// (ex.: mensagem travada em "Aguardando mensagem" no celular do cliente),
// onde o motivo real só aparece no log interno da lib. Usar 'debug' pontual,
// nunca deixar ligado em produção (log gigante).
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

function authDataPath(orgId) {
  return path.join(__dirname, '..', '.baileys_auth', orgId);
}

async function updateSession(supabase, orgId, patch) {
  const { error } = await supabase.from('webjs_sessions').update(patch).eq('org_id', orgId);
  if (error) logger.error('Falha ao atualizar webjs_sessions', { orgId, message: error.message });
}

// Marca bloqueio e já agenda a janela de recuperação de confiança do chip —
// a regra de escalonamento vive no banco (whatsapp_hub.mark_webjs_blocked),
// a mesma usada pela Edge Function do botão manual "Fui bloqueado", pra
// nunca ter duas versões da mesma regra.
// `kind`: 'confirmed' (403 real, ou o botão manual) vs 'risk' (score da
// baileys-antiban subiu — indício, não confirmação do WhatsApp; ver
// campaignWorker.js::checkAntibanRisk) — pedido do dono (2026-08-27) pra
// telas diferentes, uma "temos indícios" e outra "confirmado".
async function markBlocked(supabase, orgId, reason, kind = 'confirmed') {
  // A sessão pode ainda estar "conectada" do ponto de vista do Baileys
  // (falha só nos envios) quando isso é chamado via botão manual. Encerra o
  // socket sem apagar a credencial: o mesmo QR continua válido, é só
  // questão de esperar as 24h, não precisa escanear de novo.
  const existing = sessions.get(orgId);
  if (existing) {
    intentionallyStopped.add(orgId);
    sessions.delete(orgId);
    try {
      existing.sock.end(undefined);
    } catch {
      // socket já pode estar em estado ruim (é por isso que estamos
      // marcando bloqueio) — encerrar de qualquer jeito é o objetivo.
    }
  }

  const { error } = await supabase.rpc('mark_webjs_blocked', { p_org_id: orgId, p_reason: reason, p_block_kind: kind });
  if (error) logger.error('Falha ao marcar bloqueio', { orgId, message: error.message });
}

async function upsertWebjsChannel(supabase, orgId, phone) {
  const { data: existing } = await supabase
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('provider', 'webjs')
    .maybeSingle();

  if (existing) {
    await supabase.from('channels').update({ phone, is_active: true, label: 'WhatsApp (grátis)' }).eq('id', existing.id);
  } else {
    await supabase.from('channels').insert({ org_id: orgId, provider: 'webjs', label: 'WhatsApp (grátis)', phone, is_active: true });
  }
}

function extractPhone(sockUser) {
  // sockUser.id vem como "5511999999999:12@s.whatsapp.net" — pega só o numero.
  if (!sockUser?.id) return null;
  const digits = sockUser.id.split(':')[0].split('@')[0];
  return digits ? `+${digits}` : null;
}

async function startSession(supabase, orgId) {
  if (sessions.has(orgId) || reconnecting.has(orgId)) return;

  intentionallyStopped.delete(orgId);
  logger.info('Iniciando sessão Baileys', { orgId });
  const authDir = authDataPath(orgId);
  fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const rawSock = makeWASocket({
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    syncFullHistory: false,
    // BUG REAL DE PRODUÇÃO (2026-09-04): sem isto, mensagem nossa que o
    // celular do cliente não consegue descriptografar fica travada como
    // "Aguardando mensagem" PRA SEMPRE. O celular dele pede reenvio
    // automático, o Baileys chama getMessage() pra buscar o conteúdo
    // original e reencriptar -- e o DEFAULT do Baileys é retornar undefined,
    // ou seja, "não tenho", e ele desiste. Ver sentMessageStore.js pro
    // detalhe completo da causa raiz.
    getMessage: sentMessageStore.makeGetMessage(supabase),
  });

  // Recupera o progresso de aquecimento salvo (se já rodou antes) — sem
  // isso, todo reinício do worker faria a lib achar que o número é novo de
  // novo, mesmo já estando estabelecido há meses.
  const { data: savedState } = await supabase
    .from('webjs_sessions')
    .select('antiban_warmup_state')
    .eq('org_id', orgId)
    .maybeSingle();

  // Embrulha o socket com a baileys-antiban (jitter, aquecimento de chip
  // novo, simulação de digitação humana, detecção de erro 463) — camada
  // adicional POR BAIXO do nosso próprio motor de delay (campaignWorker.js
  // continua mandando no ritmo dele; a lib só reforça, nunca afrouxa).
  // Preset 'conservative': o mais cauteloso que a lib oferece — já vem com
  // aquecimento automático embutido (10 dias, começa em 15 msgs/dia,
  // multiplica por 1.8x/dia até estabilizar), sem precisar de nada nosso.
  const sock = wrapSocket(rawSock, 'conservative', savedState?.antiban_warmup_state ?? undefined);

  // Guard de reply-ratio (2026-08-27, achado da pesquisa de repositórios do
  // Baileys pedida pelo dono): a própria baileys-antiban já tem um módulo
  // que pausa envio pra um contato específico se ele não responde nada
  // (padrão de mercado: <10% de resposta em disparo de alto volume é sinal
  // forte de bloqueio, independente do ritmo) — só que vem DESLIGADO por
  // padrão na lib. Ativa aqui com os valores default dela (10% mínimo,
  // após 5 msgs pro mesmo contato, 24h de pausa se violar). Acesso via
  // getter público `sock.antiban.replyRatio` — se a lib mudar essa API
  // numa versão futura, o optional chaining faz isso só não fazer nada,
  // sem derrubar a conexão.
  if (sock.antiban?.replyRatio) {
    sock.antiban.replyRatio.config.enabled = true;
  }

  // BUG REAL #3 encontrado em produção (2026-09-03): mensagens via contato
  // "@lid" (ver inbound.js) travando com "Failed to decrypt message... Bad
  // MAC" em loop, e resposta da IA chegando como "Aguardando mensagem"
  // pra sempre no celular do cliente -- é a race LID/PN que a própria
  // baileys-antiban documenta (issue Baileys #1769): a sessão Signal fica
  // amarrada a UM formato de JID (lid OU phone-number), e mandar pro outro
  // formato quebra a descriptografia do outro lado. A lib tem um módulo
  // pronto pra isso (`JidCanonicalizer`) mas vem DESLIGADO por padrão e
  // configurá-lo via `wrapSocket()` exigiria misturar com o preset
  // 'conservative' de um jeito frágil (a lib trata isso como "config legada"
  // e ignoraria os limites de anti-bloqueio silenciosamente) -- por isso
  // instanciado aqui À PARTE, no modo de uso documentado pela própria lib
  // (README de jidCanonicalizer.js), sem tocar no wrapSocket. Alimentado
  // pelos mesmos eventos que a lib alimentaria sozinha se estivesse
  // habilitada por dentro; usado em oneToOne.js/campaignWorker.js antes de
  // cada sendMessage.
  const jidCanonicalizer = new JidCanonicalizer({ enabled: true });

  // rawSock guardado à parte de propósito -- ver getRawSocket() lá embaixo.
  sessions.set(orgId, { sock, rawSock, saveCreds, jidCanonicalizer });
  sock.ev.on('creds.update', saveCreds);

  // Mensagens recebidas: 'notify' = mensagem nova de verdade (chegando agora).
  // 'append'/outros tipos são sync de histórico ao reconectar — ignorados de
  // propósito (fase 1 não trata histórico antigo, só conversa daqui pra frente).
  sock.ev.on('messages.upsert', (upsert) => {
    // Aprende o mapeamento lid<->telefone de QUALQUER tipo de evento (não só
    // 'notify') -- inclusive sync de histórico costuma trazer esse dado.
    jidCanonicalizer.onIncomingEvent(upsert);
    if (upsert.type !== 'notify') return;
    void handleIncomingMessages(supabase, orgId, upsert.messages ?? []);
  });

  // Sinal adicional de aprendizado do mapeamento lid<->telefone (vem em
  // atualizações de status de mensagem já enviada, não só em recebidas).
  sock.ev.on('messages.update', (updates) => {
    jidCanonicalizer.onMessageUpdate(updates);
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        await updateSession(supabase, orgId, { status: 'qr', qr_data_url: qrDataUrl, last_error: null });
        logger.info('QR code gerado', { orgId });
      } catch (err) {
        logger.error('Falha ao gerar/salvar QR', { orgId, message: err.message });
      }
    }

    if (connection === 'open') {
      const phone = extractPhone(sock.user);
      await updateSession(supabase, orgId, {
        status: 'ready',
        qr_data_url: null,
        phone,
        connected_at: new Date().toISOString(),
        last_error: null,
      });
      await upsertWebjsChannel(supabase, orgId, phone);
      // Socket novo = instância antiban nova = risco reseta do zero. Libera
      // a trava que evita marcar bloqueio repetido pela mesma sessão.
      require('./campaignWorker').clearAntibanGuard(orgId);
      logger.success('Conectado e pronto', { orgId, phone });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      // classifyDisconnect (baileys-antiban) é consultado só pelo `backoffMs`
      // sugerido abaixo — a categoria dela ('fatal'/'rate-limited') NÃO é mais
      // usada pra decidir bloqueio (ver comentário grande no topo do arquivo,
      // no BLOCK_STATUS_CODES — 3 misclassificações confirmadas na mesma
      // função em produção: 515, e 428/440 misturados).
      const classification = statusCode ? classifyDisconnect(statusCode) : null;
      // Único gatilho de bloqueio automático: 403 (forbidden), o único código
      // com consenso real de "restrição de spam" — todo o resto sempre
      // reconecta (ver comentário grande acima do BLOCK_STATUS_CODES).
      const isBlock = BLOCK_STATUS_CODES.has(statusCode);

      // 401 + stanza conflict/device_removed = restrição de conta, NÃO logout
      // comum (2026-09-11). O 401 sozinho continua sendo logout normal e
      // reconecta — o que separa os dois é o marcador na stanza. Serializa o
      // erro inteiro em vez de depender de um caminho fixo no objeto porque a
      // forma do payload varia entre versões do Baileys.
      // ATENÇÃO: isso é detecção PÓS-FATO. Quando esse 401 chega a conta JÁ
      // está restrita. Serve só pra aplicar a recuperação certa e parar de
      // reconectar em loop. A prevenção de verdade é o 463, tratado em
      // campaignWorker.js::checkTimelock, que chega ANTES.
      let isDeviceRemoved = false;
      if (statusCode === 401) {
        try {
          const raw = JSON.stringify(lastDisconnect?.error ?? {}) + String(lastDisconnect?.error?.message ?? '');
          isDeviceRemoved = /device_removed|conflict/i.test(raw);
        } catch {
          // erro não-serializável (referência circular): trata como logout
          // comum, que é o comportamento antigo e seguro.
        }
      }

      sessions.delete(orgId);

      if (intentionallyStopped.has(orgId)) {
        // stopSession() já chamou sock.end() — esse 'close' é esperado, não
        // é queda de conexão. Não mexe no status (stopSession já limpou) e
        // não tenta reconectar.
        intentionallyStopped.delete(orgId);
        return;
      }

      if (isDeviceRemoved) {
        const reason =
          'O WhatsApp restringiu este número e desconectou o aparelho ' +
          '(código 401 — device_removed). Restrição costuma durar 24h.';
        await markBlocked(supabase, orgId, reason);
        logger.warn('Restrição detectada (401 device_removed)', { orgId, statusCode });
        return;
      }

      if (isBlock) {
        // NÃO apaga a credencial de propósito: se a sessão ainda for válida
        // (foi só bloqueio temporário, não logout de verdade), o Baileys
        // reconecta sozinho com ela quando tentarmos de novo depois das 24h;
        // se não for mais válida, o próprio Baileys pede QR novo na hora (o
        // handler de 'qr' acima já trata isso). Reconectar AGORA (como
        // fazíamos antes) pareceria ainda mais suspeito pro WhatsApp logo
        // depois de um bloqueio.
        const reason = 'Número bloqueado temporariamente pelo WhatsApp (código 403 — forbidden).';
        await markBlocked(supabase, orgId, reason);
        logger.warn('Bloqueio detectado (403 forbidden)', { orgId, statusCode });
        return;
      }

      // Qualquer outro motivo (queda de rede, reinício do WhatsApp, etc.):
      // reconecta sozinho, sem exigir escanear QR de novo — é o que dá
      // robustez de verdade (não trava o corretor esperando notar que caiu).
      // Usa o backoff sugerido pela classificação quando tem (ex.: 500 →
      // 10s, 412 → 30s); sem classificação, o padrão de 5s de antes.
      const backoffMs = classification?.backoffMs ?? 5000;
      await updateSession(supabase, orgId, {
        status: 'reconnecting',
        last_error: `Conexão perdida (${statusCode ?? 'motivo desconhecido'}), reconectando...`,
      });
      logger.warn('Conexão perdida, reconectando', { orgId, statusCode, backoffMs });

      if (!reconnecting.has(orgId)) {
        reconnecting.add(orgId);
        setTimeout(async () => {
          reconnecting.delete(orgId);
          // Só reconecta se a org ainda quiser o canal ativo (linha ainda existe).
          const { data: stillWanted } = await supabase.from('webjs_sessions').select('org_id').eq('org_id', orgId).maybeSingle();
          if (stillWanted) {
            await startSession(supabase, orgId);
          } else {
            logger.info('Org desativou o canal durante a reconexão, cancelando', { orgId });
          }
        }, backoffMs);
      }
    }
  });
}

async function stopSession(orgId) {
  const session = sessions.get(orgId);
  if (!session) return;
  logger.info('Encerrando sessão', { orgId });
  intentionallyStopped.add(orgId);
  sessions.delete(orgId);
  try {
    session.sock.end(undefined);
  } catch (err) {
    logger.warn('Erro ao encerrar socket (ignorado)', { orgId, message: err.message });
  }
  // Pequena espera antes de apagar os arquivos de sessão: o handler de
  // 'creds.update' pode disparar uma última escrita em disco durante o
  // encerramento; apagar cedo demais faria isso falhar com erro (inofensivo,
  // mas evitável).
  setTimeout(() => {
    fs.rmSync(authDataPath(orgId), { recursive: true, force: true });
  }, 1000);
}

function getSocket(orgId) {
  return sessions.get(orgId)?.sock ?? null;
}

// Socket SEM a camada anti-bloqueio (baileys-antiban). Usar SOMENTE pra
// resposta 1:1 -- responder alguém que acabou de te escrever.
//
// BUG REAL DE PRODUÇÃO (2026-09-04): a lib bloqueou 7.143 tentativas de envio
// com "Warm-up limit: 15/15 messages today (day 1)" -- a IA simplesmente
// parava de responder o cliente depois de 15 mensagens no dia, sem nenhum
// aviso na tela. O aquecimento (15 msgs no 1º dia, subindo até ~10 dias)
// existe pra proteger o chip em DISPARO EM MASSA, onde o risco de bloqueio
// é real. Aplicar isso em conversa ativa é errado por dois motivos:
//   1. Responder quem te escreveu NUNCA é padrão de spam -- é o oposto: o
//      WhatsApp trata resposta rápida a conversa iniciada pelo contato como
//      sinal de conta legítima.
//   2. Um cliente pagante ficaria sem atendimento depois de 15 mensagens,
//      silenciosamente. Isso quebra o produto inteiro.
// Já era a intenção documentada em oneToOne.js ("o risco de bloqueio é sobre
// DISPARO EM MASSA, não sobre responder quem já está falando com você"), mas
// na prática o wrapSocket() envolve TODO sendMessage. Aqui separamos de vez:
// campanha (campaignWorker.js) continua 100% protegida pelo socket embrulhado.
function getRawSocket(orgId) {
  return sessions.get(orgId)?.rawSock ?? null;
}

function getJidCanonicalizer(orgId) {
  return sessions.get(orgId)?.jidCanonicalizer ?? null;
}

// Salva o progresso de aquecimento da lib no banco — chamado depois de
// envios (campaignWorker.js) e no desligamento gracioso do processo, pra
// sobreviver a deploy/reinício da VPS.
async function saveWarmupState(supabase, orgId) {
  const session = sessions.get(orgId);
  const antiban = session?.sock?.antiban;
  if (!antiban) return;
  try {
    const warmupState = antiban.exportWarmUpState();
    await supabase.from('webjs_sessions').update({ antiban_warmup_state: warmupState }).eq('org_id', orgId);
  } catch (err) {
    logger.error('Falha ao salvar estado de aquecimento', { orgId, message: err.message });
  }
}

function activeOrgIds() {
  return Array.from(sessions.keys());
}

// Diferente de stopSession: fecha as conexões (reinicio do processo, deploy,
// etc.) SEM apagar as credenciais salvas em disco. Na volta, o worker
// reconecta sozinho com a mesma sessão — ninguém precisa escanear QR de novo
// só porque o servidor reiniciou.
async function shutdownAll(supabase) {
  const orgIds = Array.from(sessions.keys());
  logger.info(`Encerrando ${orgIds.length} sessão(ões) por desligamento do processo...`);
  await Promise.all(
    orgIds.map(async (orgId) => {
      // Salva o progresso de aquecimento ANTES de encerrar — é agora ou
      // nunca, o processo vai morrer.
      if (supabase) await saveWarmupState(supabase, orgId);
      intentionallyStopped.add(orgId);
      const session = sessions.get(orgId);
      sessions.delete(orgId);
      try {
        session.sock.end(undefined);
      } catch {
        // processo já vai encerrar mesmo, não vale a pena logar aqui
      }
    }),
  );
}

module.exports = {
  startSession,
  stopSession,
  getSocket,
  getRawSocket,
  getJidCanonicalizer,
  activeOrgIds,
  shutdownAll,
  markBlocked,
  saveWarmupState,
};
