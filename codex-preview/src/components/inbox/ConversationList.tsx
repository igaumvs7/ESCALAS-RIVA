import { Bot, Inbox, Instagram, MessageCircle, Pin, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import type { WhatsappProvider } from '@/hooks/useWhatsappProvider';
import type { ConversationChannel, ConversationWithContact } from '@/types/inbox';

// Badge de canal: WhatsApp (webjs/Baileys) ou Instagram.
function channelBadge(channel: ConversationChannel | undefined, _provider: WhatsappProvider) {
  if (channel === 'instagram') {
    return { Icon: Instagram, label: 'Instagram', color: 'text-[#E1306C]', chip: 'bg-[rgba(225,48,108,0.14)] text-[#E1306C]' };
  }
  return { Icon: MessageCircle, label: 'WhatsApp', color: 'text-[#25D366]', chip: 'bg-[rgba(37,211,102,0.14)] text-[#25D366]' };
}

interface ConversationListProps {
  conversations: ConversationWithContact[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  // IA desligada no canal (configurações) → badge vira "Humano".
  aiEnabledForChannel?: (channel: string | null) => boolean;
  // Canal da conversa (WhatsApp × Instagram) p/ o badge.
  providerOf?: (conv: ConversationWithContact) => WhatsappProvider;
  // Fixar/desfixar no topo (2026-09-05) — botão pequeno ao lado do horário.
  onTogglePin?: (id: string, pinned: boolean) => void;
}

function statusBadge(c: ConversationWithContact, aiEnabled: boolean) {
  if (c.status === 'closed') {
    return { Icon: Inbox, label: 'Fechada', color: 'text-[var(--color-text-secondary)]' };
  }
  if (!aiEnabled) {
    return { Icon: User, label: 'Humano', color: 'text-[var(--color-success)]' };
  }
  if (c.status === 'ai_active') {
    return { Icon: Bot, label: 'IA', color: 'text-[var(--accent-primary)]' };
  }
  return { Icon: User, label: 'Humano', color: 'text-[var(--color-success)]' };
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  aiEnabledForChannel,
  providerOf,
  onTogglePin,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="p-6 text-center text-label opacity-60">Carregando...</div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-label mb-2">Nenhuma conversa aqui</div>
        <div className="text-xs text-[var(--color-text-secondary)] opacity-70 max-w-[240px] mx-auto">
          Conversas aparecem aqui assim que um contato enviar a primeira mensagem, ou mude de aba
          acima pra ver fechadas/arquivadas.
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.06)]">
      {conversations.map((c) => {
        const aiEnabled = aiEnabledForChannel?.(c.channel ?? null) ?? true;
        const badge = statusBadge(c, aiEnabled);
        const Icon = badge.Icon;
        const chan = channelBadge(c.channel, providerOf?.(c) ?? (c.channel === 'instagram' ? 'instagram' : 'whatsapp'));
        const ChanIcon = chan.Icon;
        const isActive = c.id === selectedId;
        const contact = c.contact;
        const displayName = contact?.name?.trim() || contact?.phone || '—';
        return (
          <li key={c.id} className="group">
            {/* `div role=button`, não <button>, porque o toggle de fixar
                precisa de um <button> de verdade ao lado do horário —
                aninhar <button> dentro de <button> é HTML inválido (era a
                causa do pin sobrepor o horário antes: tinha que ficar
                posicionado `absolute` por cima de tudo, em vez de ocupar
                espaço normal ao lado do horário). */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
              className={cn(
                'w-full cursor-pointer text-left p-3 transition-colors',
                'hover:bg-white/[0.03]',
                c.pinned && 'bg-[rgba(var(--accent-primary-rgb),0.04)]',
                isActive && 'bg-[rgba(var(--accent-secondary-rgb),0.08)] border-l-2 border-[var(--accent-primary)]',
                !isActive && 'border-l-2 border-transparent',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar src={contact?.profile_pic_url} name={displayName} size="md" />
                  <span
                    title={chan.label}
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0A0A0F] ring-1 ring-[rgba(var(--accent-secondary-rgb),0.2)]"
                  >
                    <ChanIcon className={cn('h-2.5 w-2.5', chan.color)} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate min-w-0">
                      {displayName}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {onTogglePin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(c.id, !c.pinned);
                          }}
                          title={c.pinned ? 'Desfixar conversa' : 'Fixar conversa no topo'}
                          aria-label={c.pinned ? 'Desfixar conversa' : 'Fixar conversa no topo'}
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-secondary)] transition-opacity hover:bg-white/10 hover:text-[var(--accent-primary)]',
                            c.pinned ? 'opacity-100 text-[var(--accent-primary)]' : 'opacity-0 group-hover:opacity-100',
                          )}
                        >
                          <Pin className={cn('h-3 w-3', c.pinned && 'fill-current')} />
                        </button>
                      )}
                      <span className="text-[10px] text-[var(--color-text-secondary)] whitespace-nowrap">
                        {formatTimestamp(c.last_message_at)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                    {c.lastMessagePreview ?? <span className="opacity-40">—</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                    <span className={cn('inline-flex min-w-0 items-center gap-1 text-[9px] uppercase tracking-wide font-semibold', badge.color)}>
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{badge.label}</span>
                    </span>
                    {/* Badge do canal: WhatsApp · Instagram */}
                    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-semibold', chan.chip)}>
                      {chan.label}
                    </span>
                    {/* "IA pausada" só faz sentido quando a IA está LIGADA para o
                        canal. Com a IA desativada, ai_paused=true é só efeito do
                        roteamento pra humano — não mostramos o selo. */}
                    {c.ai_paused && aiEnabled && (
                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] uppercase tracking-wide font-semibold text-[#FBBF24]">
                        ⏸ IA pausada
                      </span>
                    )}
                    {c.unread_count > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] font-bold bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)] rounded-full px-2 py-0.5">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
