import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Inbox as InboxIcon, Info, PanelRightClose, PanelRightOpen, Search, X } from 'lucide-react';
import { useAiChannels } from '@/hooks/useAiChannels';
import { useWhatsappProvider } from '@/hooks/useWhatsappProvider';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useNotifications } from '@/hooks/useNotifications';
import { useTags } from '@/hooks/useTags';
import { ConversationList } from '@/components/inbox/ConversationList';
import { ConversationTabs } from '@/components/inbox/ConversationTabs';
import { MessageThread } from '@/components/inbox/MessageThread';
import { MessageInput } from '@/components/inbox/MessageInput';
import { ContactPanel } from '@/components/inbox/ContactPanel';
import { PinnedNoteBar } from '@/components/inbox/PinnedNoteBar';
import { InboxFilters } from '@/components/inbox/InboxFilters';
import {
  matchesFilters,
  readFiltersFromParams,
  sortConversations,
  statusBucket,
  writeFiltersToParams,
  type InboxFilterState,
  type InboxSort,
  type StatusBucket,
} from '@/components/inbox/inbox-filters';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';

export default function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFiltersState] = useState<InboxFilterState>(() =>
    readFiltersFromParams(searchParams),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('conversation'),
  );
  const [sort, setSort] = useState<InboxSort>('recente');
  // No mobile (<lg) mostramos uma coluna por vez: lista quando nada está
  // selecionado, senão a thread. O painel de contato vira um overlay.
  const [showPanelMobile, setShowPanelMobile] = useState(false);
  // Painel de contato (coluna direita, xl+) recolhível; preferência persiste.
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem('inbox_panel_collapsed') === '1',
  );
  const togglePanel = () =>
    setPanelCollapsed((v) => {
      localStorage.setItem('inbox_panel_collapsed', v ? '0' : '1');
      return !v;
    });
  const { tags } = useTags();
  const { aiEnabledForChannel } = useAiChannels();
  const { providerOf } = useWhatsappProvider();

  // Persiste os filtros na querystring (namespace f*), preservando ?conversation.
  const updateFilters = (next: InboxFilterState) => {
    setFiltersState(next);
    setSearchParams((prev) => writeFiltersToParams(prev, next), { replace: true });
  };

  // Sync selectedId ↔ URL query. Notifications deep-link into the inbox with
  // ?conversation=<uuid> — we pick it up here and also update the URL when
  // the operator switches rows so sharing / bookmarks work.
  useEffect(() => {
    const fromUrl = searchParams.get('conversation');
    if (fromUrl && fromUrl !== selectedId) {
      setSelectedId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (selectedId && searchParams.get('conversation') !== selectedId) {
      // Merge — não sobrescreve os params de filtro.
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('conversation', selectedId);
          return p;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const {
    conversations,
    loading: loadingConvs,
    error: convError,
    reload: reloadConvs,
    setStatus,
    setAiPaused,
    setPinnedNote,
    setPinned,
    setArchived,
    markRead,
  } = useConversations();

  const visibleConversations = useMemo(() => {
    const now = Date.now();
    const filtered = conversations.filter((c) => matchesFilters(c, filters, now));
    return sortConversations(filtered, sort);
  }, [conversations, filters, sort]);

  // Contagem de cada aba (Em atendimento / Fechadas / Arquivadas) — sobre o
  // total de conversas, independente dos demais filtros (nome/tag/canal...),
  // pra bater com a expectativa de "quantas eu tenho" em cada tipo de chat.
  const tabCounts = useMemo(() => {
    const counts: Record<StatusBucket, number> = { abertas: 0, fechadas: 0, arquivadas: 0 };
    for (const c of conversations) counts[statusBucket(c)]++;
    return counts;
  }, [conversations]);

  const setActiveTab = (next: StatusBucket) => updateFilters({ ...filters, status: next });

  const { messages, loading: loadingMsgs, sendText, retry, dismissFailed } = useMessages(selectedId);
  const { markReadByConversation, unreadCount } = useNotifications();

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Bug real reportado pelo dono (2026-09-05): fechar a única conversa
  // deixava a lista vazia mas a thread continuava mostrando o contato
  // fechado. Fix original: desmarcar a seleção quando ela sai da lista
  // filtrada.
  //
  // Bug NOVO reportado (2026-09-06, "quando filtra aí dá tela [em
  // branco]"): esse mesmo efeito, usando `visibleConversations` (todos os
  // eixos do filtro), fechava a conversa aberta na hora que você só
  // ajustava um filtro AVANÇADO (interesse/tag/canal/atendente/janela/
  // busca) — sem nunca ter saído dela nem trocado de aba. Ex.: abre uma
  // conversa "interessado", clica em "Sem interesse" só pra explorar o
  // filtro, e a thread/painel somem sozinhos, mesmo a conversa continuando
  // "aberta" de verdade (nem fechou, nem arquivou).
  //
  // Fix: só desmarca quando o motivo é a ABA (tipo de chat) — fechou,
  // arquivou, ou você trocou de aba manualmente. Filtro avançado só
  // decide o que aparece NA LISTA; nunca fecha o que você já está vendo.
  useEffect(() => {
    if (loadingConvs || !selectedId) return;
    const sel = conversations.find((c) => c.id === selectedId);
    if (sel && statusBucket(sel) !== filters.status) {
      setSelectedId(null);
    }
  }, [conversations, selectedId, filters.status, loadingConvs]);

  // Deep-link vindo do drawer do card do funil: ?contact=<uuid> seleciona a
  // conversa daquele contato assim que a lista carrega.
  useEffect(() => {
    const contactId = searchParams.get('contact');
    if (!contactId) return;
    const conv = conversations.find((c) => c.contact?.id === contactId);
    if (conv) setSelectedId(conv.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // Auto-select the first conversation only on desktop (lg+). No mobile,
  // auto-selecionar esconderia a lista e jogaria o usuário direto na thread.
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }
    if (searchParams.get('contact')) return; // deixa o deep-link por contato decidir
    const firstOpen = visibleConversations[0];
    if (!selectedId && firstOpen) {
      setSelectedId(firstOpen.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConversations, selectedId]);

  // Clear unread count when a conversation is open AND visible.
  useEffect(() => {
    if (selected && selected.unread_count > 0) {
      void markRead(selected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.unread_count]);

  // Abrir a conversa também dá por lidas as NOTIFICAÇÕES dela (o sininho do
  // topo) — pedido do dono: ler a mensagem no Inbox tem que tirar o aviso do
  // sino sozinho, sem precisar limpar na mão. O sino é outro componente, com
  // sua própria instância do hook: ele se atualiza pelo realtime da tabela
  // notifications (evento UPDATE), que este update dispara.
  // Depende também de `unreadCount`: a conversa é selecionada (via URL) antes
  // da lista de notificações carregar, então rodar só no `selectedId` perdia a
  // janela e o sino nunca limpava. Com o contador nas dependências, assim que
  // as notificações chegam (ou uma nova entra) o efeito roda de novo.
  useEffect(() => {
    if (selectedId) void markReadByConversation(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, unreadCount]);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
            <InboxIcon className="h-5 w-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="text-label">Seção</div>
            <h1 className="text-2xl font-bold text-display">Inbox</h1>
          </div>
        </div>
      </div>

      {convError && (
        <div className="mb-3">
          <LoadErrorBanner message={convError} onRetry={() => void reloadConvs()} />
        </div>
      )}

      <div
        className={`flex-1 lg:grid gap-3 min-h-0 ${
          panelCollapsed ? 'lg:grid-cols-[300px_1fr_44px]' : 'lg:grid-cols-[300px_1fr_320px]'
        }`}
      >
        {/* Left: conversation list — no mobile some quando há conversa aberta */}
        <div
          className={`glass-card p-0 flex-col overflow-hidden h-full ${
            selectedId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-[rgba(var(--accent-secondary-rgb),0.08)] space-y-2">
            <ConversationTabs active={filters.status} counts={tabCounts} onChange={setActiveTab} />
            {/* Busca sempre visível — pedido do dono (2026-09-06): antes o
                nome/telefone ficavam escondidos dentro do popover de
                Filtros, "difícil de usar no dia a dia". Igual WhatsApp
                Web/Telegram: campo de busca direto, sem precisar abrir nada. */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" />
              <input
                value={filters.busca}
                onChange={(e) => updateFilters({ ...filters, busca: e.target.value })}
                placeholder="Buscar por nome ou telefone..."
                className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] py-2 pl-8 pr-8 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
              {filters.busca && (
                <button
                  type="button"
                  onClick={() => updateFilters({ ...filters, busca: '' })}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[var(--color-text-secondary)] hover:bg-white/10 hover:text-[var(--color-text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <InboxFilters
                filters={filters}
                onChange={updateFilters}
                sort={sort}
                onSortChange={setSort}
                tags={tags}
              />
            </div>
            <div className="flex justify-end">
              <span className="text-[11px] text-[var(--color-text-secondary)] whitespace-nowrap">
                {visibleConversations.length} conversa{visibleConversations.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConversationList
              conversations={visibleConversations}
              loading={loadingConvs}
              selectedId={selectedId}
              onSelect={setSelectedId}
              aiEnabledForChannel={aiEnabledForChannel}
              providerOf={providerOf}
              onTogglePin={(id, pinned) => void setPinned(id, pinned)}
            />
          </div>
        </div>

        {/* Center: thread — no mobile ocupa a tela quando há conversa aberta */}
        <div
          className={`glass-card p-0 flex-col overflow-hidden h-full ${
            selectedId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selected ? (
            <>
              <div className="p-3 border-b border-[rgba(var(--accent-secondary-rgb),0.08)] flex items-center gap-2">
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Voltar à lista"
                  className="lg:hidden h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[var(--color-text-primary)] text-sm truncate">
                    {selected.contact?.name?.trim() || selected.contact?.phone || '—'}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate">
                    {selected.contact?.phone}
                  </div>
                </div>
                <button
                  onClick={() => setShowPanelMobile(true)}
                  aria-label="Detalhes da conversa"
                  className="xl:hidden h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                >
                  <Info className="h-4.5 w-4.5" />
                </button>
              </div>
              {/* Nota fixa logo abaixo do nome, editável no próprio lugar
                  (lápis = editar, lixeira = excluir) — ver PinnedNoteBar.tsx. */}
              <PinnedNoteBar
                note={selected.pinned_note}
                onSave={(note) => setPinnedNote(selected.id, note)}
              />

              <MessageThread
                messages={messages}
                loading={loadingMsgs}
                onRetry={retry}
                onDismiss={dismissFailed}
              />
              {selected.status !== 'closed' && (
                <MessageInput
                  conversationId={selected.id}
                  onSendText={sendText}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-label opacity-60">
                Selecione uma conversa para ver a thread
              </div>
            </div>
          )}
        </div>

        {/* Right: contact panel — coluna fixa só em xl; abaixo disso é overlay.
            Recolhível: vira uma régua estreita com botão de expandir. */}
        <div className="hidden xl:flex glass-card p-0 overflow-hidden h-full flex-col">
          {panelCollapsed ? (
            <button
              onClick={togglePanel}
              aria-label="Expandir painel de detalhes"
              title="Expandir painel"
              className="h-full w-full flex items-start justify-center pt-3 text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            >
              <PanelRightOpen className="h-4.5 w-4.5" />
            </button>
          ) : selected ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(var(--accent-secondary-rgb),0.08)]">
                <span className="text-label">Detalhes</span>
                <button
                  onClick={togglePanel}
                  aria-label="Recolher painel de detalhes"
                  title="Recolher painel"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <ContactPanel
                  conversation={selected}
                  aiEnabled={aiEnabledForChannel(selected.channel ?? null)}
                  onPauseAI={() => setAiPaused(selected.id, true)}
                  onResumeAI={() => setAiPaused(selected.id, false)}
                  onClose={() => setStatus(selected.id, 'closed')}
                  onReopen={() => setStatus(selected.id, 'human_active')}
                  onPinNote={(note) => setPinnedNote(selected.id, note)}
                  onTogglePin={(pinned) => setPinned(selected.id, pinned)}
                  onArchive={(a) => setArchived(selected.id, a)}
                  onContactRefresh={() => void reloadConvs()}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-end px-2 py-2">
                <button
                  onClick={togglePanel}
                  aria-label="Recolher painel de detalhes"
                  title="Recolher painel"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-label opacity-60">Sem conversa selecionada</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Overlay do painel de contato em telas < xl */}
      {selected && showPanelMobile && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPanelMobile(false)}
          />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] glass-surface border-l border-[rgba(var(--accent-secondary-rgb),0.15)] overflow-y-auto">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setShowPanelMobile(false)}
                aria-label="Fechar detalhes"
                className="h-11 w-11 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ContactPanel
              conversation={selected}
              aiEnabled={aiEnabledForChannel(selected.channel ?? null)}
              onPauseAI={() => setAiPaused(selected.id, true)}
              onResumeAI={() => setAiPaused(selected.id, false)}
              onClose={() => setStatus(selected.id, 'closed')}
              onReopen={() => setStatus(selected.id, 'human_active')}
              onPinNote={(note) => setPinnedNote(selected.id, note)}
              onTogglePin={(pinned) => setPinned(selected.id, pinned)}
              onArchive={(a) => setArchived(selected.id, a)}
              onContactRefresh={() => void reloadConvs()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
