export type ConversationStatus = 'ai_active' | 'human_active' | 'closed';
// Classificação/resultado do lead — painel de Leads (Dashboard). Manual por
// enquanto; classificação automática pela IA é uma fase futura.
// 'qualificado' = teve interesse real mas não fechou negócio/objetivo.
// 'venda_concluida' = fechou de verdade.
export type LeadInterest =
  | 'nao_classificado'
  | 'interessado'
  | 'sem_interesse'
  | 'qualificado'
  | 'venda_concluida';
export type ConversationChannel = 'whatsapp' | 'instagram';
export type MessageDirection = 'inbound' | 'outbound';
// 'owner' = mensagem que o dono do número enviou direto pelo WhatsApp do
// celular (fora do CRM), capturada pelo webhook UAZAPI. Renderiza como "WhatsApp".
export type SenderType = 'contact' | 'ai' | 'operator' | 'system' | 'owner';
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'note';
export type MetaMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface Conversation {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  ai_paused: boolean;
  channel: ConversationChannel;
  // Negócio (deal) em foco nesta conversa. Independente de assigned_to/owner_id.
  active_deal_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  pinned_note: string | null;
  // Fixar no topo da lista (2026-09-05) — independente de pinned_note (que é
  // o texto da nota fixa exibida no topo da thread).
  pinned: boolean;
  archived: boolean;
  // Conta Zernio que recebeu a conversa (multi-conta no Zernio).
  zernio_account_id: string | null;
  // Provedor: 'zernio' (WhatsApp Meta oficial / Instagram) × 'uazapi'
  // (integração direta, sem janela de 24h). Último inbound decide.
  provider: 'zernio' | 'uazapi';
  lead_interest: LeadInterest;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  sender_id: string | null;
  content_type: ContentType;
  content: string | null;
  media_url: string | null;
  zernio_message_id: string | null;
  // Status de entrega relayado pelo Zernio (coluna meta_status mantida).
  meta_status: MetaMessageStatus | null;
  // Motivo da falha de entrega (webhook 1:1 ou sync de broadcast).
  error_reason: string | null;
  is_private_note: boolean;
  created_at: string;
}

export interface ConversationWithContact extends Conversation {
  contact: {
    id: string;
    // Nullable: contatos Instagram não têm telefone.
    phone: string | null;
    name: string | null;
    email: string | null;
    // Foto do lead (via UAZAPI). Null para leads Zernio → fallback iniciais.
    profile_pic_url: string | null;
    custom_fields: Record<string, unknown>;
  } | null;
  lastMessagePreview: string | null;
  // IDs das tags do contato — usados pelo filtro de Tags do inbox (Módulo 7).
  tagIds: string[];
  // Timestamp da última mensagem do CONTATO (inbound) — deriva a janela de 24h
  // da Meta sem coluna dedicada.
  lastInboundAt: string | null;
}
