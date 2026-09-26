import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ----------------------------------------------------------------------------
// RenewalReportTab — aba "Renovação" dentro de /admin (pedido do dono,
// 2026-09-14): "o João assinou uma vez e nunca mais renovou... eu queria um
// relatório disso, pra poder entrar em contato e trazer o cliente de volta".
//
// Uma organização = um cliente (corretor) nesse modelo de cadastro self-serve
// — o nome digitado no cadastro ("Nome e sobrenome") é o próprio
// organizations.name. A classificação (nunca pagou / pagou 1x / renovava e
// parou / ativo / em atraso) é montada aqui a partir dos campos crus que a
// RPC platform_renewal_report() devolve — fácil de reajustar a régua sem
// mexer no banco.
// ----------------------------------------------------------------------------

interface RenewalRow {
  org_id: string;
  org_name: string;
  whatsapp_contact: string | null;
  plan: 'bot' | 'jarvis' | null;
  status: 'pending_first_payment' | 'active' | 'grace_period' | 'blocked' | 'canceled';
  signed_up_at: string;
  payments_count: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
  current_period_end: string | null;
}

type Situacao = 'ativo' | 'em_atraso' | 'nunca_pagou' | 'pagou_uma_vez' | 'parou_de_renovar';

function classificar(row: RenewalRow): Situacao {
  if (row.status === 'active') return 'ativo';
  if (row.status === 'grace_period') return 'em_atraso';
  if (row.payments_count <= 0) return 'nunca_pagou';
  if (row.payments_count === 1) return 'pagou_uma_vez';
  return 'parou_de_renovar';
}

const SITUACAO_LABEL: Record<Situacao, string> = {
  ativo: 'Ativo',
  em_atraso: 'Em atraso',
  nunca_pagou: 'Nunca pagou',
  pagou_uma_vez: 'Assinou 1x, não renovou',
  parou_de_renovar: 'Renovava, parou',
};

const SITUACAO_STYLE: Record<Situacao, string> = {
  ativo: 'bg-[rgba(16,185,129,0.12)] text-[#10B981]',
  em_atraso: 'bg-[rgba(251,191,36,0.14)] text-[#FBBF24]',
  nunca_pagou: 'bg-white/5 text-[var(--color-text-secondary)]',
  pagou_uma_vez: 'bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]',
  parou_de_renovar: 'bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]',
};

const FILTERS: { key: Situacao | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pagou_uma_vez', label: 'Assinaram 1x e sumiram' },
  { key: 'parou_de_renovar', label: 'Renovavam e pararam' },
  { key: 'nunca_pagou', label: 'Nunca pagaram' },
  { key: 'em_atraso', label: 'Em atraso' },
  { key: 'ativo', label: 'Ativos' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type SortDir = 'asc' | 'desc';

export function RenewalReportTab() {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Situacao | 'todos'>('pagou_uma_vez');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = async () => {
    setLoading(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.schema('whatsapp_hub').rpc('platform_renewal_report');
    if (error) {
      toast.error('Falha ao carregar o relatório de renovação', { description: error.message });
      setLoading(false);
      return;
    }
    setRows((data ?? []) as RenewalRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const withSituacao = useMemo(
    () => rows.map((r) => ({ ...r, situacao: classificar(r), diasSemRenovar: diasDesde(r.last_paid_at ?? r.signed_up_at) })),
    [rows],
  );

  const counts = useMemo(() => {
    const c: Record<Situacao, number> = { ativo: 0, em_atraso: 0, nunca_pagou: 0, pagou_uma_vez: 0, parou_de_renovar: 0 };
    withSituacao.forEach((r) => { c[r.situacao] += 1; });
    return c;
  }, [withSituacao]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = withSituacao.filter((r) => {
      if (filter !== 'todos' && r.situacao !== filter) return false;
      if (!q) return true;
      return r.org_name.toLowerCase().includes(q) || (r.whatsapp_contact ?? '').toLowerCase().includes(q);
    });
    list.sort((a, b) => {
      const diff = (b.diasSemRenovar ?? -1) - (a.diasSemRenovar ?? -1);
      return sortDir === 'desc' ? diff : -diff;
    });
    return list;
  }, [withSituacao, filter, search, sortDir]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold">Renovação</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Quem assinou e sumiu — pra entrar em contato e tentar trazer de volta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--color-text-primary)] disabled:opacity-40"
          aria-label="Atualizar"
          title="Atualizar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition',
              filter === f.key
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]'
                : 'bg-white/5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {f.label}
            {f.key !== 'todos' && <span className="ml-1.5 opacity-70">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou WhatsApp..."
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
        />
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sortDir === 'asc' && 'rotate-180')} />
          {sortDir === 'desc' ? 'Mais tempo sumido primeiro' : 'Mais recente primeiro'}
        </button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-secondary)] opacity-60">
            Ninguém nesse filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-label border-b border-[rgba(var(--accent-secondary-rgb),0.12)]">
                  <th className="text-left font-semibold pb-3 pr-4">Cliente</th>
                  <th className="text-left font-semibold pb-3 pr-4">WhatsApp</th>
                  <th className="text-left font-semibold pb-3 pr-4">Situação</th>
                  <th className="text-left font-semibold pb-3 pr-4">Renovações</th>
                  <th className="text-left font-semibold pb-3 pr-4">1º pagamento</th>
                  <th className="text-left font-semibold pb-3 pr-4">Último pagamento</th>
                  <th className="text-left font-semibold pb-3">Sem renovar há</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.08)]">
                {filtered.map((r) => (
                  <tr key={r.org_id} className="text-[var(--color-text-primary)]">
                    <td className="py-3 pr-4 font-medium">{r.org_name}</td>
                    <td className="py-3 pr-4">
                      {r.whatsapp_contact ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(r.whatsapp_contact ?? '');
                            toast.success('Número copiado.');
                          }}
                          className="flex items-center gap-1.5 font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        >
                          <Copy className="h-3 w-3" /> {r.whatsapp_contact}
                        </button>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', SITUACAO_STYLE[r.situacao])}>
                        {SITUACAO_LABEL[r.situacao]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">{r.payments_count}</td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">{fmtDate(r.first_paid_at)}</td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">{fmtDate(r.last_paid_at)}</td>
                    <td className="py-3 text-[var(--color-text-secondary)]">
                      {r.diasSemRenovar != null ? `${r.diasSemRenovar} dia${r.diasSemRenovar === 1 ? '' : 's'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
