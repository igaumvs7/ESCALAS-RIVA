// ============================================================================
// InboxFilters — pedido do dono (2026-09-05/06, 2 rodadas de feedback: "não
// bate a lógica" e depois "continua terrível — campos demais, visual feio,
// difícil de usar"). Reescrito do zero: a busca por nome/telefone/email
// (o que qualquer corretor usa toda hora) saiu do popover e virou um campo
// de busca sempre visível (ver InboxPage.tsx) — igual WhatsApp Web/Telegram,
// não escondida atrás de um clique. Este popover agora só guarda os eixos
// avançados (interesse do lead, atendente, canal, tags, janela de 24h),
// como uma lista compacta de chips — não mais um formulário de CRM B2B
// genérico com 8 campos (Nome/Email/Telefone/Empresa/Data não faziam
// sentido pra lead de corretor, contato individual por WhatsApp).
//
// O painel abre num portal no <body> porque o ancestral `.glass-card`
// (backdrop-filter + overflow-hidden) recorta popovers e a coluna da lista é
// estreita (300px).
// ============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, ChevronDown, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types/crm';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  INBOX_SORT_LABEL,
  type Atendente,
  type ChannelFilter,
  type InboxFilterState,
  type InboxSort,
  type InteresseFilter,
  type JanelaFilter,
} from './inbox-filters';

interface Props {
  filters: InboxFilterState;
  onChange: (next: InboxFilterState) => void;
  sort: InboxSort;
  onSortChange: (next: InboxSort) => void;
  tags: Tag[];
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {label}
        </span>
        {hint && <span className="text-[10px] text-[var(--color-text-secondary)] opacity-60">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors',
        active
          ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--color-text-primary)]'
          : 'border-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[rgba(var(--accent-secondary-rgb),0.35)]',
      )}
    >
      {children}
    </button>
  );
}

// Dropdown de seleção múltipla (tags), idêntico ao do funil.
function MultiSelect({
  placeholder,
  options,
  selected,
  onChange,
}: {
  placeholder: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggleId = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-2.5 py-1.5 text-left text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]"
      >
        <span className={selected.length ? '' : 'text-[var(--color-text-secondary)]'}>
          {selected.length ? `${selected.length} selecionada(s)` : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <div
          className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.3)] p-1 shadow-[0_0_30px_rgba(var(--accent-secondary-rgb),0.15)]"
          style={{ backgroundColor: 'var(--color-bg-primary)' }}
        >
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-[var(--color-text-secondary)]">Nenhuma tag criada ainda</div>
          )}
          {options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => toggleId(o.id)}
                className="accent-[var(--accent-primary)]"
              />
              <span className="truncate">{o.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const CHANNEL_OPTS: { v: ChannelFilter; label: string }[] = [
  { v: 'all', label: 'Todos' },
  { v: 'whatsapp', label: 'WhatsApp' },
  { v: 'instagram', label: 'Instagram' },
];
const ATENDENTE_OPTS: { v: Atendente; label: string }[] = [
  { v: 'ia', label: 'IA' },
  { v: 'humano', label: 'Humano' },
];
const INTERESSE_OPTS: { v: InteresseFilter; label: string }[] = [
  { v: 'any', label: 'Qualquer' },
  { v: 'interessado', label: 'Tem interesse' },
  { v: 'sem_interesse', label: 'Sem interesse' },
  { v: 'qualificado', label: 'Qualificado' },
  { v: 'venda_concluida', label: 'Venda concluída' },
  { v: 'nao_classificado', label: 'Não classificado' },
];
// Só faz sentido no Instagram (API oficial da Meta) — o canal webjs
// (WhatsApp, Baileys não-oficial) não tem essa janela.
const JANELA_OPTS: { v: JanelaFilter; label: string }[] = [
  { v: 'any', label: 'Qualquer' },
  { v: 'dentro', label: 'Dentro de 24h' },
  { v: 'fora', label: 'Fora de 24h' },
];

export function InboxFilters({ filters, onChange, sort, onSortChange, tags }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const count = activeFilterCount(filters);

  // Reposiciona o popover a partir do retângulo do botão (portal no body).
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelW = Math.min(304, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
      setAnchor({ top: r.bottom + 8, left });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Fecha ao clicar fora (considera o botão e o painel no portal).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const set = <K extends keyof InboxFilterState>(k: K, v: InboxFilterState[K]) =>
    onChange({ ...filters, [k]: v });

  const panel = (
    <div className="p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--color-text-primary)]">Filtros</div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar filtros"
          className="h-8 w-8 flex sm:hidden items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Section label="Interesse do lead">
        <div className="flex flex-wrap gap-1.5">
          {INTERESSE_OPTS.map((o) => (
            <Chip key={o.v} active={filters.interesse === o.v} onClick={() => set('interesse', o.v)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Atendente">
        <div className="flex flex-wrap gap-1.5">
          {ATENDENTE_OPTS.map((o) => (
            <Chip
              key={o.v}
              active={filters.atendente.includes(o.v)}
              onClick={() => set('atendente', toggle(filters.atendente, o.v))}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Tags">
        <MultiSelect placeholder="Todas" options={tags} selected={filters.tagIds} onChange={(ids) => set('tagIds', ids)} />
      </Section>

      <Section label="Canal">
        <div className="flex flex-wrap gap-1.5">
          {CHANNEL_OPTS.map((o) => (
            <Chip key={o.v} active={filters.channel === o.v} onClick={() => set('channel', o.v)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Janela de 24h" hint="só Instagram">
        <div className="flex flex-wrap gap-1.5">
          {JANELA_OPTS.map((o) => (
            <Chip key={o.v} active={filters.janela === o.v} onClick={() => set('janela', o.v)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Section>

      {count > 0 && (
        <div className="flex justify-end pt-1 border-t border-[rgba(var(--accent-secondary-rgb),0.1)]">
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS, busca: filters.busca, status: filters.status })}
            className="inline-flex items-center gap-1 rounded-md border border-[rgba(var(--accent-secondary-rgb),0.2)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--accent-primary)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-3 w-3" /> Limpar filtros
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
          count > 0
            ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.12)] text-[var(--color-text-primary)]'
            : 'border-[rgba(var(--accent-secondary-rgb),0.2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Filtros
        {count > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-primary)] px-1 text-[10px] font-bold text-[var(--accent-primary-contrast)]">
            {count}
          </span>
        )}
      </button>

      {/* Ordenação da lista. */}
      <label className="inline-flex flex-1 min-w-0 items-center gap-1.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] px-2.5 py-2 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--accent-primary)]">
        <ArrowUpDown className="h-3.5 w-3.5 opacity-70 shrink-0" />
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as InboxSort)}
          className="w-full min-w-0 bg-transparent text-xs text-[var(--color-text-primary)] outline-none [&>option]:bg-[var(--color-bg-primary)]"
        >
          {(Object.keys(INBOX_SORT_LABEL) as InboxSort[]).map((s) => (
            <option key={s} value={s}>{INBOX_SORT_LABEL[s]}</option>
          ))}
        </select>
      </label>

      {open &&
        createPortal(
          <>
            {/* Desktop: popover ancorado. Mobile: bottom-sheet com overlay. */}
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                ...(anchor ? { '--pop-top': `${anchor.top}px`, '--pop-left': `${anchor.left}px` } : {}),
              } as React.CSSProperties}
              className={cn(
                // Pedido do dono (2026-09-06): "vem algo nada a ver com os
                // temas que fizemos, cada um tem suas cores e seus
                // detalhes". A caixa era uma cor fixa (#0F1223) que ignorava
                // o tema ativo. Primeira tentativa usou a classe `.glass-card`
                // (fundo semitransparente + blur) igual o resto do sistema,
                // mas por cima da lista de conversas (que tem texto real, não
                // só o fundo da página) ficava ilegível — texto do painel se
                // misturando com o texto da lista por baixo. Fundo OPACO,
                // mas ainda derivado de --color-bg-primary (que MUDA de tom
                // por tema — confirmado nos 10 temas em globals.css) e borda/
                // brilho de --accent-secondary-rgb, como os outros menus
                // flutuantes do sistema (UserMenu, OrgSwitcher).
                'z-50 border border-[rgba(var(--accent-secondary-rgb),0.3)] shadow-[0_0_40px_rgba(var(--accent-secondary-rgb),0.15)]',
                'fixed inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl',
                // Desktop: trava a altura num menu pequeno de verdade (pedido
                // do dono, 2026-09-06: "quando filtra dá tela" — o popover
                // cobria praticamente a coluna inteira). Com 5 grupos de
                // filtro empilhados ele passava de 500px de altura; agora
                // trava em 21rem (336px) com scroll PRÓPRIO por dentro —
                // nunca mais toma conta da tela, não importa quantos filtros
                // existam.
                'sm:inset-x-auto sm:bottom-auto sm:w-[19rem] sm:max-w-[92vw] sm:max-h-[21rem] sm:rounded-xl',
                'sm:top-[var(--pop-top)] sm:left-[var(--pop-left)]',
              )}
            >
              {panel}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
