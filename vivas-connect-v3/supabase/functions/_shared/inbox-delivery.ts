// ============================================================================
// _shared/inbox-delivery.ts
// ----------------------------------------------------------------------------
// Único canal: webjs (VIVAS ENVIA / Baileys). O socket vive no worker
// separado (fora desta Edge Function) — aqui só confirmamos que a conversa
// tem um canal webjs ativo e devolvemos null. A linha em `messages` fica
// com webjs_message_id NULL, e é isso que sinaliza pro worker (polling a
// cada alguns segundos) que precisa enviar de verdade. O chamador NÃO deve
// marcar meta_status='sent' quando o retorno for null por esse motivo.
//
// Mídia (imagem/vídeo/áudio/documento) segue o MESMO caminho — pedido do
// dono (2026-09-06): "a IA vai mandar a foto do empreendimento". Antes essa
// função lançava erro de propósito ("ainda não é suportado") porque o
// worker (oneToOne.js) só sabia mandar texto; agora oneToOne.js lê
// content_type/media_url da própria linha e envia via Baileys
// (image/video/audio/document), então aqui não precisa mais bloquear —
// mesmo comportamento do texto: devolve null, quem envia de verdade é o
// worker.
// ============================================================================

import type { getAdminClient } from './supabase-admin.ts';
import { getSendContextForConversation } from './channels.ts';

type Admin = ReturnType<typeof getAdminClient>;

export interface InboxTarget {
  conversationRowId: string; // whatsapp_hub.conversations.id
  orgId: string; // organização dona da conversa
  channel: 'whatsapp' | 'instagram';
  phone: string | null;
  // Canal (número) carimbado na conversa; null em conversas legadas.
  channelId?: string | null;
}

export interface InboxSendPayload {
  text?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
  voiceNote?: boolean;
}

export async function sendInboxWithResolve(
  admin: Admin,
  target: InboxTarget,
  _payload: InboxSendPayload,
): Promise<string | null> {
  await getSendContextForConversation(admin, {
    org_id: target.orgId,
    channel_id: target.channelId ?? null,
  });
  return null;
}
