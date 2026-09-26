// ============================================================================
// _shared/channels.ts — números WhatsApp por organização
// ----------------------------------------------------------------------------
// Único provider suportado: 'webjs' (VIVAS ENVIA / Baileys). Zernio e UAZAPI
// foram descontinuados (2026-08-22) — decisão de produto, a API oficial
// exigiria cada corretor ter sua própria chave, inviável pro modelo.
//
// O socket do WhatsApp em si vive no worker separado (webjs-worker/, fora
// desta Edge Function) — este módulo só resolve QUAL canal pertence a uma
// conversa/campanha. Quem decide "não envia sincronamente, só enfileira" é
// sendInboxWithResolve (ver _shared/inbox-delivery.ts).
// ============================================================================

import type { getAdminClient } from './supabase-admin.ts';

type Admin = ReturnType<typeof getAdminClient>;

export interface ChannelRow {
  id: string;
  org_id: string;
  provider: 'webjs';
  label: string;
  phone: string | null;
  webhook_secret: string;
  assigned_member: string | null;
  is_active: boolean;
  // IA por número — refina o master switch ai_agent_config.active_whatsapp.
  ai_enabled: boolean;
  // Auto-add de leads ao funil: quando um lead entra em contato por este canal
  // pela 1ª vez, cria um deal no pipeline/stage escolhidos.
  funnel_auto_add: boolean;
  funnel_pipeline_id: string | null;
  funnel_stage_id: string | null;
}

const CHANNEL_COLUMNS =
  'id, org_id, provider, label, phone, webhook_secret, assigned_member, is_active, ai_enabled, '
  + 'funnel_auto_add, funnel_pipeline_id, funnel_stage_id';

export async function getChannelById(
  admin: Admin,
  channelId: string,
): Promise<ChannelRow | null> {
  const { data, error } = await admin
    .from('channels')
    .select(CHANNEL_COLUMNS)
    .eq('id', channelId)
    .maybeSingle();
  if (error) throw error;
  return (data as ChannelRow | null) ?? null;
}

export async function getChannelByWebhookSecret(
  admin: Admin,
  secret: string,
): Promise<ChannelRow | null> {
  if (!secret) return null;
  const { data, error } = await admin
    .from('channels')
    .select(CHANNEL_COLUMNS)
    .eq('webhook_secret', secret)
    .maybeSingle();
  if (error) throw error;
  return (data as ChannelRow | null) ?? null;
}

export async function listActiveChannels(
  admin: Admin,
  orgId: string,
): Promise<ChannelRow[]> {
  const { data, error } = await admin
    .from('channels')
    .select(CHANNEL_COLUMNS)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ChannelRow[];
}

// Único canal webjs ativo da org — fallback para conversas legadas
// (sem channel_id carimbado).
export async function getSoleWebjsChannel(
  admin: Admin,
  orgId: string,
): Promise<ChannelRow | null> {
  const { data, error } = await admin
    .from('channels')
    .select(CHANNEL_COLUMNS)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChannelRow | null) ?? null;
}

export interface SendContext {
  provider: 'webjs';
  orgId: string;
  channel: ChannelRow;
}

// Resolve o contexto de ENVIO para uma conversa: usa o canal carimbado
// (channel_id); linhas legadas caem no fallback do único canal ativo da org.
export async function getSendContextForConversation(
  admin: Admin,
  conv: { org_id: string; channel_id?: string | null },
): Promise<SendContext> {
  let channel: ChannelRow | null = null;
  if (conv.channel_id) {
    channel = await getChannelById(admin, conv.channel_id);
  }
  if (!channel) {
    channel = await getSoleWebjsChannel(admin, conv.org_id);
  }
  if (!channel) {
    throw new Error('Nenhum canal VIVAS ENVIA ativo configurado para esta organização.');
  }
  return { provider: 'webjs', orgId: conv.org_id, channel };
}
