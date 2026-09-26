import type { ConversationWithContact, LeadInterest } from '@/types/inbox';

// Estado dos filtros do inbox (Módulo 7).
//
// Reescrito 2026-09-05 e 2026-09-06 (pedido do dono, 2 rodadas: "os filtros
// não fazem o menor sentido" e depois "continua terrível — campos demais,
// visual feio, difícil de usar"). Mudanças de fundo:
//   1) `status` (aberta/fechada/arquivada) virou os 3 tipos de chat (abas
//      visíveis acima da lista — ver ConversationTabs), não é mais filtro.
//   2) "Cliente / Lead" usava a tabela `deals` (Funil, removido da UI em
//      2026-08-22) — filtro morto na prática. Virou "Interesse do lead",
//      baseado em `conversations.lead_interest` (mesmo campo do Dashboard).
//   3) "Atribuído a" saiu junto da remoção da atribuição manual.
//   4) Nome/Email/Telefone/Empresa/Última interação (5 campos de texto/data,
//      modelo de CRM B2B genérico) viraram UMA busca só (`busca`), sempre
//      visível acima da lista — como WhatsApp Web/Telegram, não escondida
//      num popover. "Empresa" e "Última interação" saíram de vez: nunca
//      fazem sentido pra lead de corretor (pessoa física, contato por
//      WhatsApp) — ninguém preenche isso na prática.
export type ChannelFilter = 'all' | 'whatsapp' | 'instagram';
export type Atendente = 'ia' | 'humano';
export type StatusBucket = 'abertas' | 'fechadas' | 'arquivadas';
export type JanelaFilter = 'any' | 'dentro' | 'fora';
export type InteresseFilter = 'any' | LeadInterest;

export interface InboxFilterState {
  // Busca livre — casa contra nome, telefone (só dígitos) ou email do
  // contato. Substitui os antigos campos separados Nome/Email/Telefone.
  busca: string;
  // Tipo de chat — 3 abas, uma ativa por vez (ver comentário acima).
  status: StatusBucket;
  // Eixos avançados (popover "Filtros").
  channel: ChannelFilter;
  atendente: Atendente[]; // vazio = qualquer
  tagIds: string[]; // any-match; vazio = qualquer
  janela: JanelaFilter;
  interesse: InteresseFilter;
}

export const DEFAULT_FILTERS: InboxFilterState = {
  busca: '',
  status: 'abertas',
  channel: 'all',
  atendente: [],
  tagIds: [],
  janela: 'any',
  interesse: 'any',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isWithinWindow(c: ConversationWithContact, now: number): boolean {
  return Boolean(c.lastInboundAt) && now - new Date(c.lastInboundAt as string).getTime() < DAY_MS;
}

function convChannel(c: ConversationWithContact): ChannelFilter {
  if (c.channel === 'instagram') return 'instagram';
  if (c.channel === 'whatsapp') return 'whatsapp';
  return 'all';
}

// Bucket de status derivado: arquivada domina; senão closed → fechadas; senão
// aberta (ai_active | human_active). Exportado para alimentar a contagem de
// cada aba (ConversationTabs) sem duplicar a regra.
export function statusBucket(c: ConversationWithContact): StatusBucket {
  if (c.archived) return 'arquivadas';
  if (c.status === 'closed') return 'fechadas';
  return 'abertas';
}

// Predicado central: uma conversa passa se satisfaz TODOS os eixos ativos (AND).
export function matchesFilters(
  c: ConversationWithContact,
  f: InboxFilterState,
  now: number,
): boolean {
  if (statusBucket(c) !== f.status) return false;

  const busca = f.busca.trim().toLowerCase();
  if (busca) {
    const nome = (c.contact?.name ?? '').toLowerCase();
    const email = (c.contact?.email ?? '').toLowerCase();
    const buscaDigitos = busca.replace(/\D/g, '');
    const foneMatch = buscaDigitos && (c.contact?.phone ?? '').replace(/\D/g, '').includes(buscaDigitos);
    if (!nome.includes(busca) && !email.includes(busca) && !foneMatch) return false;
  }

  if (f.channel !== 'all' && convChannel(c) !== f.channel) return false;

  if (f.atendente.length > 0) {
    const want: string[] = f.atendente.map((a) => (a === 'ia' ? 'ai_active' : 'human_active'));
    if (!want.includes(c.status)) return false;
  }

  if (f.tagIds.length > 0) {
    const hit = c.tagIds.some((t) => f.tagIds.includes(t));
    if (!hit) return false;
  }

  if (f.interesse !== 'any' && c.lead_interest !== f.interesse) return false;

  if (f.janela !== 'any') {
    const within = isWithinWindow(c, now);
    if (f.janela === 'dentro' && !within) return false;
    if (f.janela === 'fora' && within) return false;
  }

  return true;
}

// Quantos eixos estão ativos — alimenta o badge do botão Filtros. `status`
// não conta (virou aba); `busca` também não (tem campo próprio, sempre
// visível, com o seu próprio "x" de limpar).
export function activeFilterCount(f: InboxFilterState): number {
  let n = 0;
  if (f.channel !== 'all') n++;
  if (f.atendente.length > 0) n++;
  if (f.tagIds.length > 0) n++;
  if (f.janela !== 'any') n++;
  if (f.interesse !== 'any') n++;
  return n;
}

// ---- Ordenação --------------------------------------------------------------

export type InboxSort = 'recente' | 'antiga' | 'nao_lidas' | 'alfabetica';

export const INBOX_SORT_LABEL: Record<InboxSort, string> = {
  recente: 'Mais recentes',
  antiga: 'Mais antigas',
  nao_lidas: 'Não lidas primeiro',
  alfabetica: 'Ordem alfabética (A–Z)',
};

function lastAt(c: ConversationWithContact): number {
  return c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
}

function convDisplayName(c: ConversationWithContact): string {
  return (c.contact?.name?.trim() || c.contact?.phone || '').toLowerCase();
}

// Fixadas sempre no topo (2026-09-05), independente do critério de
// ordenação escolhido — o critério só decide a ordem DENTRO de cada grupo
// (fixadas / não fixadas).
export function sortConversations(
  list: ConversationWithContact[],
  sort: InboxSort,
): ConversationWithContact[] {
  const byCriteria = (arr: ConversationWithContact[]): ConversationWithContact[] => {
    switch (sort) {
      case 'antiga':
        return arr.sort((a, b) => lastAt(a) - lastAt(b));
      case 'nao_lidas':
        return arr.sort(
          (a, b) => (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0) || lastAt(b) - lastAt(a),
        );
      case 'alfabetica':
        return arr.sort((a, b) => convDisplayName(a).localeCompare(convDisplayName(b), 'pt-BR'));
      case 'recente':
      default:
        return arr.sort((a, b) => lastAt(b) - lastAt(a));
    }
  };
  const pinned = byCriteria(list.filter((c) => c.pinned));
  const rest = byCriteria(list.filter((c) => !c.pinned));
  return [...pinned, ...rest];
}

// ---- Persistência em querystring ------------------------------------------
// Namespace f* para não colidir com ?conversation= / ?contact= já usados.
export function readFiltersFromParams(sp: URLSearchParams): InboxFilterState {
  const csv = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);
  const ch = sp.get('fch');
  const channel: ChannelFilter =
    ch === 'whatsapp' || ch === 'instagram' ? ch : 'all';
  const atendente = csv(sp.get('fat')).filter(
    (v): v is Atendente => v === 'ia' || v === 'humano',
  );
  const st = sp.get('fst');
  const status: StatusBucket =
    st === 'fechadas' || st === 'arquivadas' ? st : 'abertas';
  const tagIds = csv(sp.get('ftg'));
  const jw = sp.get('fjw');
  const janela: JanelaFilter = jw === 'dentro' || jw === 'fora' ? jw : 'any';
  const it = sp.get('fin');
  const interesse: InteresseFilter =
    it === 'interessado' || it === 'sem_interesse' || it === 'qualificado' || it === 'venda_concluida' || it === 'nao_classificado'
      ? it
      : 'any';
  return {
    busca: sp.get('fq') ?? '',
    status,
    channel,
    atendente,
    tagIds,
    janela,
    interesse,
  };
}

// Aplica os params de filtro num objeto de params existente (preserva os
// demais, ex.: conversation). Só grava o que difere do default.
export function writeFiltersToParams(
  sp: URLSearchParams,
  f: InboxFilterState,
): URLSearchParams {
  const next = new URLSearchParams(sp);
  const setOrDel = (key: string, val: string, on: boolean) => {
    if (on) next.set(key, val);
    else next.delete(key);
  };
  setOrDel('fq', f.busca.trim(), f.busca.trim() !== '');
  setOrDel('fst', f.status, f.status !== 'abertas');
  setOrDel('fch', f.channel, f.channel !== 'all');
  setOrDel('fat', f.atendente.join(','), f.atendente.length > 0);
  setOrDel('ftg', f.tagIds.join(','), f.tagIds.length > 0);
  setOrDel('fjw', f.janela, f.janela !== 'any');
  setOrDel('fin', f.interesse, f.interesse !== 'any');
  return next;
}
