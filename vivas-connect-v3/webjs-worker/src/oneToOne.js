'use strict';

const logger = require('./logger');
const sessionManager = require('./sessionManager');
const sentMessageStore = require('./sentMessageStore');

// Respostas 1:1 (operador na Inbox, IA) são inseridas pela Edge Function com
// webjs_message_id NULL — o socket Baileys vive aqui, fora da Edge Function,
// então quem entrega de verdade é este polling. Diferente de campanha em
// massa: aqui é conversa normal, sem delay artificial (uma resposta imediata
// é o comportamento esperado, não parece "robô" — o risco de bloqueio do
// motor anti-bloqueio é sobre DISPARO EM MASSA, não sobre responder quem já
// está falando com você).
let running = false;

// Quantas vezes tentar enviar a MESMA mensagem antes de desistir e marcar
// como falha. Evita o loop infinito descrito no catch lá embaixo. 10 x 3s =
// ~30s de tentativas, tempo de sobra pra falha passageira (queda de rede,
// reconexão) sem virar retentativa eterna.
const MAX_SEND_ATTEMPTS = 10;
const failureCounts = new Map(); // messageId -> tentativas seguidas que falharam

// Mídia (foto/catálogo do empreendimento, etc.) — pedido do dono
// (2026-09-06): a IA precisa conseguir mandar de verdade o que ela decide
// via [MEDIA:rotulo] (parseado em process-ai-message, que grava
// content_type/media_url na linha). Deriva o payload do Baileys a partir do
// content_type; documento também precisa de mimetype+fileName (Baileys
// exige os dois, senão o WhatsApp recebe o arquivo sem nome/tipo).
const DOC_MIME_BY_EXT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
};

function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'arquivo';
  } catch {
    return 'arquivo';
  }
}

function buildMediaContent(contentType, mediaUrl, caption) {
  const cap = caption && caption.trim() ? caption.trim() : undefined;
  if (contentType === 'image') return { image: { url: mediaUrl }, caption: cap };
  if (contentType === 'video') return { video: { url: mediaUrl }, caption: cap };
  if (contentType === 'audio') return { audio: { url: mediaUrl }, mimetype: 'audio/mpeg' };
  // document / qualquer outro tipo de arquivo
  const fileName = fileNameFromUrl(mediaUrl);
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimetype = DOC_MIME_BY_EXT[ext] || 'application/octet-stream';
  return { document: { url: mediaUrl }, mimetype, fileName, caption: cap };
}

async function sendPendingOneToOne(supabase) {
  if (running) return;
  running = true;
  try {
    const orgIds = sessionManager.activeOrgIds();
    if (orgIds.length === 0) return;

    const { data: pending, error } = await supabase
      .from('messages')
      .select('id, org_id, conversation_id, content, content_type, media_url')
      .in('org_id', orgIds)
      .eq('direction', 'outbound')
      .in('sender_type', ['operator', 'ai'])
      .eq('is_private_note', false)
      .is('webjs_message_id', null)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      logger.error('Falha ao buscar mensagens 1:1 pendentes', { message: error.message });
      return;
    }
    if (!pending || pending.length === 0) return;

    for (const row of pending) {
      const isMedia = row.content_type && row.content_type !== 'text' && row.media_url;
      if (!row.content && !isMedia) continue;
      // Socket SEM a camada de aquecimento anti-bloqueio -- ver o comentário
      // longo em sessionManager.js::getRawSocket(). Resumo: o limite de
      // aquecimento (15 msgs no 1º dia) é proteção pra DISPARO EM MASSA;
      // aplicado aqui, fazia a IA parar de responder o cliente no meio da
      // conversa, em silêncio (bug real: 7.143 envios bloqueados num dia).
      // Fallback pro socket embrulhado se o cru não estiver disponível.
      const sock = sessionManager.getRawSocket(row.org_id) ?? sessionManager.getSocket(row.org_id);
      if (!sock) continue; // sessão caiu entre a query e agora — tenta de novo no próximo tick

      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id, provider')
          .eq('id', row.conversation_id)
          .maybeSingle();
        if (!conv || conv.provider !== 'webjs') continue; // não é canal webjs (não deveria acontecer)

        const { data: contact } = await supabase
          .from('contacts')
          .select('phone, custom_fields')
          .eq('id', conv.contact_id)
          .maybeSingle();
        if (!contact?.phone) {
          await supabase.from('messages').update({ meta_status: 'failed' }).eq('id', row.id);
          continue;
        }

        const digits = contact.phone.replace(/\D/g, '');
        const [result] = await sock.onWhatsApp(digits);
        if (!result?.exists || !result.jid) {
          await supabase.from('messages').update({ meta_status: 'failed' }).eq('id', row.id);
          continue;
        }

        // BUG REAL DE PRODUÇÃO (2026-09-04) -- causa confirmada com o log
        // interno do Baileys ligado em debug:
        //   enviávamos     -> 558592620981@s.whatsapp.net   (endereço telefone)
        //   celular pedia  -> 154795352555738@lid           (endereço LID)
        // São dois endereços da MESMA pessoa, com sessões de criptografia
        // SEPARADAS. Mandando por um caminho enquanto o aparelho escuta pelo
        // outro, ele nunca consegue descriptografar -> "Aguardando mensagem"
        // eterno. Quando sabemos o LID do contato (guardado por inbound.js a
        // partir da mensagem que ELE mandou), enviamos por ele -- é o
        // endereço que o próprio aparelho usa, então a sessão bate.
        // Sem LID conhecido (contato que nunca escreveu, disparo em massa
        // pra número novo), cai no comportamento antigo: JID do onWhatsApp
        // canonicalizado pela baileys-antiban.
        const knownLid = contact.custom_fields?.wa_lid;
        const canonicalizer = sessionManager.getJidCanonicalizer(row.org_id);
        const targetJid =
          (typeof knownLid === 'string' && knownLid.endsWith('@lid') ? knownLid : null) ??
          canonicalizer?.canonicalizeTarget(result.jid) ??
          result.jid;

        // Se esse destino JÁ falhou antes, renova a sessão de criptografia
        // agora -- evita a falha em vez de remediar depois (o reenvio cura,
        // mas leva ~2min e o cliente vê "Aguardando mensagem" nesse meio
        // tempo). Não faz nada pra destino saudável.
        await sentMessageStore.forceFreshSessionIfNeeded(sock, targetJid);

        // baileys-antiban exige o 3o argumento (options) em sendMessage --
        // sem ele, `options.circuitBreaker` explode com "Cannot read
        // properties of undefined" (bug real de producao, 2026-09-03: as
        // 2 primeiras tentativas de resposta 1:1 da IA quebraram aqui).
        const content = isMedia
          ? buildMediaContent(row.content_type, row.media_url, row.content)
          : { text: row.content };
        const sent = await sock.sendMessage(targetJid, content, {});
        // Guarda o conteúdo pra conseguir REENVIAR se o celular do cliente
        // pedir (mensagem que chega como "Aguardando mensagem" travada) --
        // ver sentMessageStore.js. Sem isso o WhatsApp desiste sozinho. Pra
        // mídia, guarda o texto da legenda (ou vazio) -- reenviar o
        // ARQUIVO de novo do zero não é o caso coberto por esse cache hoje.
        sentMessageStore.remember(sent?.key?.id, isMedia ? (row.content || '') : row.content);
        await supabase
          .from('messages')
          .update({ meta_status: 'sent', webjs_message_id: sent?.key?.id ?? null })
          .eq('id', row.id);
        failureCounts.delete(row.id); // deu certo -- zera o contador
        logger.success('Resposta 1:1 enviada', { orgId: row.org_id });
      } catch (err) {
        // Guarda contra loop infinito: sem isto, uma mensagem que falha
        // sempre (ex.: bloqueio de limite diário) fica sendo retentada a
        // cada 3s pra sempre. Bug real de produção (2026-09-04): 7.143
        // tentativas bloqueadas no log de um único dia, enterrando qualquer
        // outro erro e desperdiçando recurso. Depois de MAX_SEND_ATTEMPTS a
        // mensagem é marcada como falha e para de ser tentada -- fica
        // visível no Inbox como não enviada, em vez de sumir em silêncio.
        const attempts = (failureCounts.get(row.id) ?? 0) + 1;
        failureCounts.set(row.id, attempts);
        if (attempts >= MAX_SEND_ATTEMPTS) {
          await supabase.from('messages').update({ meta_status: 'failed' }).eq('id', row.id);
          failureCounts.delete(row.id);
          logger.error('Mensagem 1:1 desistida após várias tentativas', {
            orgId: row.org_id,
            messageId: row.id,
            attempts,
            message: err.message,
          });
          continue;
        }
        logger.error('Falha ao enviar mensagem 1:1', { orgId: row.org_id, attempts, message: err.message });
      }
    }
  } finally {
    running = false;
  }
}

module.exports = { sendPendingOneToOne };
