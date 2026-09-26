import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ImagePlus,
  Inbox,
  Loader2,
  Megaphone,
  MessageSquare,
  MessageSquareHeart,
  Send,
  User,
  UserRoundCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNotifications, type NotificationRow } from '@/hooks/useNotifications';
import { useSystemAnnouncements, uploadAnnouncementImage } from '@/hooks/useSystemAnnouncements';
import { useAppUser } from '@/app/providers/AppUserProvider';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// ----------------------------------------------------------------------------
// NotificationsDropdown — pedido do dono: "quero que a aba de notificações
// tenha 2 abas SISTEMA / PERFIL... toda atualização do sistema que eu fizer
// ou eu quiser escrever algo pra mandar pra todos... a pessoa possa clicar e
// ler melhor... a outra aba de perfil tudo aquilo que ela recebe do perfil
// dela... cada aba caso tenha mensagem fique com o balãozinho até a pessoa
// clicar".
//
// SISTEMA = comunicados globais (useSystemAnnouncements — tabela própria,
// sem org_id, todo mundo vê o mesmo comunicado). Só o super admin escreve
// (formulário aparece só pra ele). PERFIL = a lista de notificações que já
// existia (new_message/handoff/feedback), sem mudança de comportamento —
// só mudou de aba.
// ----------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function iconFor(type: NotificationRow['type']) {
  if (type === 'new_message') return MessageSquare;
  if (type === 'handoff') return UserRoundCog;
  if (type === 'feedback') return MessageSquareHeart;
  return Inbox;
}

function TabBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--color-error)] text-white text-[9px] font-bold flex items-center justify-center">
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function NotificationsDropdown() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAppUser();
  const { notifications, unreadCount: perfilUnread, markRead, markAllRead } = useNotifications();
  const { announcements, readIds, unreadCount: sistemaUnread, markRead: markAnnouncementRead, create } = useSystemAnnouncements();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'sistema' | 'perfil'>('perfil');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const totalUnread = perfilUnread + sistemaUnread;

  // Click-outside to close. Listen on mousedown rather than click so a click
  // that starts inside but ends outside (rare) doesn't accidentally close.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const handleItemClick = async (n: NotificationRow) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    if (n.conversation_id) {
      navigate(`/inbox?conversation=${n.conversation_id}`);
    } else if (n.type === 'feedback') {
      navigate(isSuperAdmin ? '/admin?tab=feedback' : '/feedback');
    }
  };

  const handleAnnouncementClick = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    void markAnnouncementRead(id);
  };

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_IMAGE_BYTES) {
      toast.error('Foto excede 10MB.');
      e.target.value = '';
      return;
    }
    setImageFile(f);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handlePublish = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadAnnouncementImage(imageFile);
      }
      await create(title, body, imageUrl);
      setTitle('');
      setBody('');
      removeImage();
      setComposing(false);
    } catch (err) {
      toast.error('Falha ao publicar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className={cn(sistemaUnread > 0 && 'animate-pulse')}
      >
        {/* Sino mais chamativo SÓ quando tem comunicado do Sistema não lido
            (pedido do dono: "as notificações normais pode deixar do jeito
            que está") -- brilho dourado (cor de destaque do tema) em vez do
            badge vermelho padrão, com animação, pra chamar mais atenção que
            uma notificação de perfil comum. */}
        <Bell
          className={cn(
            'h-4.5 w-4.5',
            sistemaUnread > 0 && 'text-[var(--accent-primary)] drop-shadow-[0_0_6px_rgba(var(--accent-primary-rgb),0.8)]',
          )}
        />
        {totalUnread > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1',
              sistemaUnread > 0
                ? 'bg-[var(--accent-primary)] shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.9)]'
                : 'bg-[var(--color-error)]',
            )}
          >
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-[var(--color-bg-primary)] shadow-2xl z-50 overflow-hidden max-h-[70vh] flex flex-col">
          <div className="flex items-center gap-1 p-2 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
            <button
              type="button"
              onClick={() => setTab('perfil')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                tab === 'perfil'
                  ? 'bg-[rgba(var(--accent-secondary-rgb),0.12)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <User className="h-3.5 w-3.5" />
              Perfil
              <TabBadge count={perfilUnread} />
            </button>
            <button
              type="button"
              onClick={() => setTab('sistema')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                tab === 'sistema'
                  ? 'bg-[rgba(var(--accent-secondary-rgb),0.12)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <Megaphone className="h-3.5 w-3.5" />
              Sistema
              <TabBadge count={sistemaUnread} />
            </button>
          </div>

          {tab === 'perfil' ? (
            <>
              <div className="flex items-center justify-between p-3 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {perfilUnread} não lidas · {notifications.length} recentes
                </div>
                {perfilUnread > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => void markAllRead()}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar todas
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--color-text-secondary)] opacity-60">
                    Sem notificações.
                  </div>
                ) : (
                  <ul className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.06)]">
                    {notifications.map((n) => {
                      const Icon = iconFor(n.type);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => handleItemClick(n)}
                            className={cn(
                              'w-full text-left p-3 flex items-start gap-3 transition-colors',
                              'hover:bg-white/[0.03]',
                              !n.is_read && 'bg-[rgba(var(--accent-secondary-rgb),0.04)]',
                            )}
                          >
                            <div
                              className={cn(
                                'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                                n.type === 'handoff'
                                  ? 'bg-[rgba(245,158,11,0.15)] text-[#FBBF24]'
                                  : 'bg-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--accent-primary)]',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'text-sm font-semibold truncate',
                                    n.is_read
                                      ? 'text-[var(--color-text-secondary)]'
                                      : 'text-[var(--color-text-primary)]',
                                  )}
                                >
                                  {n.title}
                                </div>
                                {!n.is_read && (
                                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] shrink-0" />
                                )}
                                <span className="ml-auto text-[10px] text-[var(--color-text-secondary)] shrink-0">
                                  {relativeTime(n.created_at)}
                                </span>
                              </div>
                              {n.body && (
                                <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
                                  {n.body}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              {isSuperAdmin && (
                <div className="border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
                  {composing ? (
                    <div className="p-3 space-y-2">
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título do comunicado"
                        disabled={sending}
                        className="w-full h-9 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        placeholder="Pessoal, estamos mexendo em tal coisa..."
                        disabled={sending}
                        className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onPickImage}
                        disabled={sending}
                      />
                      {imagePreview ? (
                        <div className="relative w-fit">
                          <img src={imagePreview} alt="" className="max-h-28 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)]" />
                          <button
                            type="button"
                            onClick={removeImage}
                            disabled={sending}
                            aria-label="Remover foto"
                            className="absolute -top-1.5 -right-1.5 rounded-full bg-[var(--color-bg-primary)] border border-[rgba(var(--accent-secondary-rgb),0.3)] p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => imageInputRef.current?.click()} disabled={sending}>
                          <ImagePlus className="h-3.5 w-3.5" />
                          Anexar foto
                        </Button>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setComposing(false); removeImage(); }} disabled={sending}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => void handlePublish()} disabled={sending || !title.trim() || !body.trim()}>
                          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Publicar pra todos
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setComposing(true)}
                      className="w-full flex items-center justify-center gap-1.5 p-3 text-xs font-semibold text-[var(--accent-primary)] hover:bg-white/[0.03] transition-colors"
                    >
                      <Megaphone className="h-3.5 w-3.5" />
                      Novo comunicado pra todo mundo
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {announcements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--color-text-secondary)] opacity-60">
                    Nenhum comunicado ainda.
                  </div>
                ) : (
                  <ul className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.06)]">
                    {announcements.map((a) => {
                      const isRead = readIds.has(a.id);
                      const isExpanded = expandedId === a.id;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => handleAnnouncementClick(a.id)}
                            className={cn(
                              'w-full text-left p-3 flex items-start gap-3 transition-colors hover:bg-white/[0.03]',
                              !isRead && 'bg-[rgba(var(--accent-secondary-rgb),0.04)]',
                            )}
                          >
                            {a.image_url ? (
                              <img
                                src={a.image_url}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover shrink-0 border border-[rgba(var(--accent-primary-rgb),0.3)]"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-[rgba(var(--accent-primary-rgb),0.15)] text-[var(--accent-primary)]">
                                <Megaphone className="h-4 w-4" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'text-sm font-semibold truncate',
                                    isRead ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)]',
                                  )}
                                >
                                  {a.title}
                                </div>
                                {!isRead && <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] shrink-0" />}
                                <span className="ml-auto text-[10px] text-[var(--color-text-secondary)] shrink-0">
                                  {relativeTime(a.created_at)}
                                </span>
                                <ChevronDown
                                  className={cn('h-3.5 w-3.5 text-[var(--color-text-secondary)] shrink-0 transition-transform', isExpanded && 'rotate-180')}
                                />
                              </div>
                              {isExpanded && a.image_url && (
                                <img src={a.image_url} alt="" className="mt-2 w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)]" />
                              )}
                              <div
                                className={cn(
                                  'text-xs text-[var(--color-text-secondary)] mt-1.5',
                                  isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
                                )}
                              >
                                {a.body}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
