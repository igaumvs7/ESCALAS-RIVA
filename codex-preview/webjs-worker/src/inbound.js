'use strict';

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const logger = require('./logger');

// Mesma lógica do zernio-webhook (find-or-create contato/conversa), mas sem
// HMAC/idempotência de webhook — aqui quem chega já é o evento real do
// Baileys, direto do socket. Texto e áudio (voz); imagem/vídeo/documento
// inbound continuam pra depois.

// Áudio de voz (2026-09-04, pedido do dono depois de reportar que a IA
// "não leu e não respondeu" um áudio de teste). Baileys entrega o arquivo
// original CRIPTOGRAFADO (sem URL pública pra baixar de fora) -- diferente
// do modelo Zernio antigo, onde o webhook já vinha com media_url pronto.
// Por isso o download+descriptografia acontece AQUI, no worker (que tem as
// chaves da sessão), e o resultado sobe pro bucket próprio virando uma URL
// assinada de verdade -- só assim o pipeline de transcrição já existente
// (trigger on_audio_inbound -> transcribe-audio, que só sabe fazer
// `fetch(media_url)` puro) consegue processar.
const AUDIO_BUCKET = 'whatsapp-hub-inbound-audio';
// 5 anos -- URL assinada não é permanente feito bucket público, mas o áudio
// de um lead deve continuar tocável no histórico do Inbox por muito tempo.
const AUDIO_SIGNED_URL_SECONDS = 60 * 60 * 24 * 365 * 5;

function audioExtension(mimetype) {
  if (!mimetype) return 'ogg';
  if (mimetype.includes('mp4') || mimetype.includes('m4a')) return 'm4a';
  if (mimetype.includes('mpeg')) return 'mp3';
  if (mimetype.includes('wav')) return 'wav';
  if (mimetype.includes('amr')) return 'amr';
  if (mimetype.includes('webm')) return 'webm';
  return 'ogg';
}

async function downloadAndUploadAudio(supabase, orgId, waMessage, waMessageId) {
  const buffer = await downloadMediaMessage(waMessage, 'buffer', {});
  const rawMimetype = waMessage.message?.audioMessage?.mimetype || 'audio/ogg';
  // WhatsApp manda tipo "audio/ogg; codecs=opus" -- a allowlist do bucket é
  // por MIME limpo, sem o parâmetro de codec.
  const mimetype = rawMimetype.split(';')[0].trim();
  const ext = audioExtension(mimetype);
  const fileId = waMessageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${orgId}/${fileId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (upErr) throw upErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, AUDIO_SIGNED_URL_SECONDS);
  if (signErr) throw signErr;
  if (!signed?.signedUrl) throw new Error('createSignedUrl não retornou URL');

  return signed.signedUrl;
}

// Bug real de produção (2026-09-03): WhatsApp/Baileys às vezes devolve o
// telefone de um contato BR sem o "nono dígito" (o 9 extra dos celulares,
// adicionado há anos) mesmo pro MESMO contato que noutro momento aparece
// com o dígito — gerava contato duplicado no Inbox ("igor vivas" 2x).
// Só mexe em número BR (+55) cujo nacional tem exatamente 10 dígitos
// (DDD + 8) com o 1º dígito do assinante 6-9 — celular antigo sem o 9
// (fixo BR nunca começa com 6-9), nunca em número que já tem 11 dígitos.
function normalizeBrazilianDigits(digits) {
  if (!digits.startsWith('55') || digits.length !== 12) return digits;
  const ddd = digits.slice(2, 4);
  const subscriber = digits.slice(4);
  if (/^[6-9]/.test(subscriber)) {
    return `55${ddd}9${subscriber}`;
  }
  return digits;
}

// waLid: o identificador "@lid" que o WhatsApp usa pra esse contato, quando
// existe. BUG REAL DE PRODUÇÃO (2026-09-04, evidência no log de debug do
// Baileys): enviávamos pro endereço de TELEFONE
// (`558592620981@s.whatsapp.net`) mas o celular do cliente pedia reenvio
// a partir do endereço LID (`154795352555738@lid`) -- são dois "endereços"
// da mesma pessoa, com sessões de criptografia SEPARADAS. Mandar por um
// caminho enquanto o aparelho escuta pelo outro = mensagem que nunca
// descriptografa ("Aguardando mensagem" eterno). Guardamos o LID aqui pra
// poder enviar pelo mesmo caminho que ele usa (ver oneToOne.js).
async function findOrCreateContact(supabase, orgId, phone, name, waLid) {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, custom_fields')
    .eq('org_id', orgId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    // Só escreve quando muda de verdade -- evita UPDATE a cada mensagem.
    if (waLid && existing.custom_fields?.wa_lid !== waLid) {
      await supabase
        .from('contacts')
        .update({ custom_fields: { ...(existing.custom_fields ?? {}), wa_lid: waLid } })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      phone,
      name,
      source: 'whatsapp',
      custom_fields: waLid ? { wa_lid: waLid } : {},
    })
    .select('id')
    .single();
  if (error) return null;
  return created.id;
}

async function getWebjsChannel(supabase, orgId) {
  const { data } = await supabase
    .from('channels')
    .select('id, ai_enabled, assigned_member')
    .eq('org_id', orgId)
    .eq('provider', 'webjs')
    .maybeSingle();
  return data ?? null;
}

async function findOrCreateConversation(supabase, orgId, contactId, channel) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, provider, channel_id, status')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) {
    const patch = {};
    if (existing.provider !== 'webjs') patch.provider = 'webjs';
    if (channel && existing.channel_id !== channel.id) patch.channel_id = channel.id;
    // Bug real reportado pelo dono: cliente cuja conversa foi fechada manda
    // mensagem nova, mas a conversa nunca reabre sozinha -- fica escondida
    // pra sempre da lista padrao do Inbox (que esconde fechadas), so
    // descoberta via notificacao. Reabre pro mesmo estado do botao "Reabrir
    // conversa" manual (status: 'human_active' -- ver useConversations.ts).
    if (existing.status === 'closed') patch.status = 'human_active';
    if (Object.keys(patch).length > 0) {
      await supabase.from('conversations').update(patch).eq('id', existing.id);
    }
    return existing.id;
  }

  const insert = {
    org_id: orgId,
    contact_id: contactId,
    status: 'ai_active',
    channel: 'whatsapp',
    provider: 'webjs',
    last_message_at: new Date().toISOString(),
  };
  if (channel) {
    insert.channel_id = channel.id;
    if (channel.assigned_member) {
      insert.assigned_to = channel.assigned_member;
      insert.assigned_at = new Date().toISOString();
    }
  }

  const { data: created, error } = await supabase.from('conversations').insert(insert).select('id').single();
  if (error) return null;
  const conversationId = created.id;

  // IA desligada nesse número: conversa nasce direto no humano (mesmo padrão
  // do zernio-webhook — o UPDATE, não o INSERT, dispara os triggers de handoff).
  if (channel && channel.ai_enabled === false) {
    await supabase
      .from('conversations')
      .update({ status: 'human_active', ai_paused: true })
      .eq('id', conversationId);
  }
  return conversationId;
}

function extractText(waMessage) {
  const m = waMessage.message;
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    null
  );
}

async function handleIncomingMessages(supabase, orgId, waMessages) {
  for (const waMessage of waMessages) {
    try {
      if (waMessage.key?.fromMe) continue;
      const jid = waMessage.key?.remoteJid;
      if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') continue; // sem grupo/status por ora

      const isAudio = Boolean(waMessage.message?.audioMessage);
      const text = extractText(waMessage);
      if (!text && !isAudio) continue; // resto (imagem sem legenda, sticker, etc.) fica pra depois

      // WhatsApp vem migrando contatos pra JIDs "@lid" (identificador interno
      // opaco, não é o número de telefone) em vez do JID clássico
      // "@s.whatsapp.net". Bug real reportado pelo dono (2026-09-03): sem
      // esse tratamento, salvávamos o ID interno como se fosse telefone --
      // a mensagem inbound gravava normal, mas a resposta da IA falhava
      // pra sempre nessa conversa (oneToOne.js -> sock.onWhatsApp(digits)
      // não acha esse "telefone" porque ele não existe de verdade). O
      // Baileys expõe o telefone real em key.senderPn quando WhatsApp manda
      // o mapeamento junto do stanza -- não é garantido em 100% dos casos.
      const isLid = jid.endsWith('@lid');
      const resolvedJid = isLid && waMessage.key?.senderPn ? waMessage.key.senderPn : jid;
      if (isLid && !waMessage.key?.senderPn) {
        logger.warn('Mensagem via @lid sem senderPn -- telefone pode ficar incorreto', {
          orgId,
          jid,
        });
      }

      const digits = normalizeBrazilianDigits(resolvedJid.split('@')[0]);
      const phone = `+${digits}`;
      const name = waMessage.pushName || null;
      const waMessageId = waMessage.key?.id || null;

      // Guarda o LID (quando a mensagem veio por ele) pra usar como endereço
      // de ENVIO -- ver comentário em findOrCreateContact.
      const waLid = isLid ? jid : null;
      const contactId = await findOrCreateContact(supabase, orgId, phone, name, waLid);
      if (!contactId) {
        logger.error('Falha ao criar/achar contato', { orgId, phone });
        continue;
      }

      const channel = await getWebjsChannel(supabase, orgId);
      const conversationId = await findOrCreateConversation(supabase, orgId, contactId, channel);
      if (!conversationId) {
        logger.error('Falha ao criar/achar conversa', { orgId, phone });
        continue;
      }

      if (waMessageId) {
        const { data: dup } = await supabase
          .from('messages')
          .select('id')
          .eq('org_id', orgId)
          .eq('webjs_message_id', waMessageId)
          .maybeSingle();
        if (dup) continue;
      }

      let mediaUrl = null;
      let insertContent = text;
      if (isAudio) {
        try {
          mediaUrl = await downloadAndUploadAudio(supabase, orgId, waMessage, waMessageId);
        } catch (err) {
          logger.error('Falha ao baixar/subir áudio recebido', { orgId, phone, message: err.message });
          continue; // sem media_url o trigger de transcrição não dispara -- melhor não gravar linha quebrada
        }
        insertContent = null;
      }

      // O trigger _on_inbound_message (mesmo que já dispara pro Zernio) aciona
      // process-ai-message sozinho a partir daqui (texto). Áudio dispara
      // separado via trigger on_audio_inbound -> transcribe-audio, que
      // reaciona a IA depois que o texto transcrito estiver pronto.
      const { error: insErr } = await supabase.from('messages').insert({
        org_id: orgId,
        conversation_id: conversationId,
        direction: 'inbound',
        sender_type: 'contact',
        content_type: isAudio ? 'audio' : 'text',
        content: insertContent,
        media_url: mediaUrl,
        webjs_message_id: waMessageId,
        is_private_note: false,
      });
      if (insErr) {
        if (insErr.code === '23505') continue; // corrida de dedup, ok
        logger.error('Falha ao inserir mensagem inbound', { orgId, message: insErr.message });
        continue;
      }

      await supabase.rpc('increment_unread_count', { p_conversation_id: conversationId });
      logger.success(isAudio ? 'Áudio recebido' : 'Mensagem recebida', { orgId, phone });
    } catch (err) {
      logger.error('Erro processando mensagem inbound', { orgId, message: err.message });
    }
  }
}

module.exports = { handleIncomingMessages };
