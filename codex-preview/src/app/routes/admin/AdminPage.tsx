import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  Loader2,
  Plus,
  LogIn,
  Pencil,
  Ban,
  RotateCcw,
  TrendingUp,
  Users,
  Percent,
  Wallet,
  Tag,
  Trash2,
  UserPlus,
  Phone,
  Copy,
  Download,
  MessageSquareHeart,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { getSupabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/plans';
import { PERIOD_PRESETS, periodRange, type PeriodKey } from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import { FeedbackAdminTab } from '@/components/admin/FeedbackAdminTab';
import { RenewalReportTab } from '@/components/admin/RenewalReportTab';

// Console do SUPER ADMIN (/admin). Lista as organizações da instância, permite
// criar, renomear, desativar/reativar e "entrar como suporte" (troca o org_id
// do JWT via /api/admin/switch-org). Uma org desativada continua na lista, mas
// seus membros são bloqueados por uma tela de aviso. O guard RequireSuperAdmin
// fica no router. (O status persiste como 'archived' no banco — "desativada" é
// só o rótulo na UI; toda a lógica de RLS/cron/webhook já filtra por 'active'.)

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
  created_at: string;
  members: number;
  whatsapp_contact: string | null;
  plan: 'bot' | 'jarvis' | null;
  segmento: string | null;
}

// Gera um slug base a partir do nome (para o campo auto-preenchido, editável).
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
  };
}

type AdminTabId = 'orgs' | 'feedback' | 'renewal';

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const activeTab: AdminTabId =
    rawTab === 'feedback' ? 'feedback' : rawTab === 'renewal' ? 'renewal' : 'orgs';
  const selectTab = (id: AdminTabId) => setParams(id === 'orgs' ? {} : { tab: id }, { replace: true });

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OrgRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orgs', { headers: await authHeaders() });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? 'Falha ao carregar organizações.');
      }
      setOrgs(body.orgs as OrgRow[]);
    } catch (err) {
      toast.error('Não foi possível carregar as organizações', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePatch = async (
    id: string,
    payload: { name?: string; slug?: string; status?: 'active' | 'archived' },
  ) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ id, ...payload }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? 'Falha ao atualizar.');
      }
      toast.success('Organização atualizada.');
      await load();
      return true;
    } catch (err) {
      toast.error('Falha ao atualizar', {
        description: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusToggle = async (org: OrgRow) => {
    const next = org.status === 'active' ? 'archived' : 'active';
    const message =
      next === 'archived'
        ? `Desativar a organização "${org.name}"? Os membros perderão o acesso e verão um aviso para contatar o administrador até a reativação.`
        : `Reativar a organização "${org.name}"? Os membros voltarão a ter acesso.`;
    const ok = await confirm({
      title: next === 'archived' ? 'Desativar organização' : 'Reativar organização',
      description: message,
      confirmLabel: next === 'archived' ? 'Desativar' : 'Reativar',
      danger: next === 'archived',
    });
    if (!ok) return;
    await handlePatch(org.id, { status: next });
  };

  const handleEnterAsSupport = async (org: OrgRow) => {
    const ok = await confirm({
      title: 'Entrar como suporte',
      description: `Entrar como suporte em "${org.name}"? Você passará a operar nessa organização.`,
      confirmLabel: 'Entrar',
    });
    if (!ok) {
      return;
    }
    setBusyId(org.id);
    try {
      const res = await fetch('/api/admin/switch-org', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ orgId: org.id }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? 'Falha ao entrar na organização.');
      }
      await getSupabase().auth.refreshSession();
      window.location.href = '/dashboard';
    } catch (err) {
      setBusyId(null);
      toast.error('Falha ao entrar como suporte', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap gap-1 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
        <button
          type="button"
          onClick={() => selectTab('orgs')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'orgs'
              ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <Building2 className="h-4 w-4" />
          Organizações
        </button>
        <button
          type="button"
          onClick={() => selectTab('feedback')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'feedback'
              ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <MessageSquareHeart className="h-4 w-4" />
          Feedback
        </button>
        <button
          type="button"
          onClick={() => selectTab('renewal')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'renewal'
              ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          <RefreshCw className="h-4 w-4" />
          Renovação
        </button>
      </div>

      {activeTab === 'feedback' ? (
        <FeedbackAdminTab />
      ) : activeTab === 'renewal' ? (
        <RenewalReportTab />
      ) : (
        <>
      <MetricsGrid />

      <CouponsSection />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-display flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--accent-primary)]" /> Organizações
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Gerencie todas as organizações desta instância. Entre como suporte para operar em nome de uma delas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WhatsAppListButton orgs={orgs} />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nova organização
          </Button>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="text-sm text-[var(--color-text-secondary)] opacity-60 py-6 text-center">
            Carregando...
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] opacity-60 py-6 text-center">
            Nenhuma organização ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-label border-b border-[rgba(var(--accent-secondary-rgb),0.12)]">
                  <th className="text-left font-semibold pb-3 pr-4">Organização</th>
                  <th className="text-left font-semibold pb-3 pr-4">Slug</th>
                  <th className="text-left font-semibold pb-3 pr-4">WhatsApp</th>
                  <th className="text-left font-semibold pb-3 pr-4">Plano</th>
                  <th className="text-left font-semibold pb-3 pr-4">Status</th>
                  <th className="text-left font-semibold pb-3 pr-4">Criada em</th>
                  <th className="text-right font-semibold pb-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.08)]">
                {orgs.map((org) => (
                  <tr key={org.id} className="text-[var(--color-text-primary)]">
                    <td className="py-3 pr-4 font-medium">{org.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-secondary)]">
                      {org.slug}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">
                      {org.whatsapp_contact ?? '—'}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">
                      {org.plan === 'jarvis' ? 'Jarvis' : org.plan === 'bot' ? 'Bot' : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={org.status} />
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-text-secondary)]">
                      {new Date(org.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconAction
                          label="Renomear"
                          onClick={() => setEditing(org)}
                          disabled={busyId === org.id}
                          icon={<Pencil className="h-4 w-4" />}
                        />
                        <IconAction
                          label={org.status === 'active' ? 'Desativar' : 'Reativar'}
                          onClick={() => void handleStatusToggle(org)}
                          disabled={busyId === org.id}
                          icon={
                            org.status === 'active' ? (
                              <Ban className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )
                          }
                        />
                        <IconAction
                          label="Entrar como suporte"
                          onClick={() => void handleEnterAsSupport(org)}
                          disabled={busyId === org.id || org.status === 'archived'}
                          icon={
                            busyId === org.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <LogIn className="h-4 w-4" />
                            )
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createOpen && (
        <CreateOrgDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}

      {editing && (
        <RenameOrgDialog
          org={editing}
          onClose={() => setEditing(null)}
          onSaved={async (name, slug) => {
            const ok = await handlePatch(editing.id, { name, slug });
            if (ok) setEditing(null);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}

// Botão "todos os WhatsApp" — pedido do dono: acesso rápido à lista completa
// dos números de contato dos clientes cadastrados, num lugar só, pra copiar.
function WhatsAppListButton({ orgs }: { orgs: OrgRow[] }) {
  const [open, setOpen] = useState(false);
  // "todos" = sem filtro. Opções vêm dos segmentos que de fato aparecem nos
  // clientes cadastrados (não a lista fixa de professions.ts) — evita opção
  // vazia pra segmento que ninguém escolheu ainda.
  const [segmentFilter, setSegmentFilter] = useState('todos');

  const withPhone = useMemo(() => orgs.filter((o) => o.whatsapp_contact), [orgs]);
  const segments = useMemo(
    () => Array.from(new Set(withPhone.map((o) => o.segmento).filter((s): s is string => !!s))).sort(),
    [withPhone],
  );
  const filtered = useMemo(
    () =>
      segmentFilter === 'todos'
        ? withPhone
        : segmentFilter === 'sem_segmento'
          ? withPhone.filter((o) => !o.segmento)
          : withPhone.filter((o) => o.segmento === segmentFilter),
    [withPhone, segmentFilter],
  );

  const copyAll = () => {
    const text = filtered.map((o) => `${o.name} — ${o.whatsapp_contact}`).join('\n');
    void navigator.clipboard.writeText(text);
    toast.success('Lista copiada.');
  };

  // CSV com ; (padrão Excel BR) + BOM UTF-8 pra acento não quebrar ao abrir —
  // mesmo formato do "Exportar CSV" de Não Responderam (NonRespondersTab.tsx).
  const downloadSpreadsheet = () => {
    const header = 'Nome;WhatsApp;Segmento\n';
    const body = filtered
      .map((o) => `${o.name.replace(/;/g, ',')};${o.whatsapp_contact ?? ''};${(o.segmento ?? '').replace(/;/g, ',')}`)
      .join('\n');
    const csv = '﻿' + header + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Phone className="h-4 w-4" /> WhatsApp dos clientes
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title={`WhatsApp dos clientes (${filtered.length})`} widthClass="max-w-lg" opaque>
          <div className="space-y-3">
            {withPhone.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)] opacity-60 text-center py-4">
                Nenhum cliente com WhatsApp cadastrado ainda.
              </p>
            ) : (
              <>
                {segments.length > 0 && (
                  <select
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value)}
                    className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  >
                    <option value="todos">Todos os segmentos</option>
                    {segments.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="sem_segmento">Sem segmento informado</option>
                  </select>
                )}
                {filtered.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)] opacity-60 text-center py-4">
                    Nenhum cliente nesse segmento.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto divide-y divide-[rgba(var(--accent-secondary-rgb),0.08)]">
                    {filtered.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{o.name}</div>
                          <div className="flex items-center gap-1.5">
                            <div className="font-mono text-xs text-[var(--color-text-secondary)]">{o.whatsapp_contact}</div>
                            {o.segmento && (
                              <span className="truncate rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                                {o.segmento}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(o.whatsapp_contact ?? '');
                            toast.success('Número copiado.');
                          }}
                          aria-label={`Copiar WhatsApp de ${o.name}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={copyAll} disabled={filtered.length === 0}>
                    <Copy className="h-4 w-4" /> Copiar lista
                  </Button>
                  <Button type="button" className="flex-1" onClick={downloadSpreadsheet} disabled={filtered.length === 0}>
                    <Download className="h-4 w-4" /> Baixar planilha
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: 'active' | 'archived' }) {
  const active = status === 'active';
  return (
    <span
      className={
        active
          ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[rgba(16,185,129,0.12)] text-[#10B981]'
          : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-white/5 text-[var(--color-text-secondary)]'
      }
    >
      {active ? 'Ativa' : 'Desativada'}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Métricas do painel do dono (VGV, plano, renovação, ativos ao mesmo tempo).
// ----------------------------------------------------------------------------
// Chama a RPC direto do navegador (não via /api/admin/*) — diferente das
// operações de organização, aqui não tem nada que precise da service role
// (só leitura agregada), e a RPC já se protege sozinha (SECURITY DEFINER +
// checa is_super_admin() usando o JWT real da sessão, que só existe nesse
// caminho — por isso NÃO dá pra chamar essa RPC pela API route com service
// role, que não carrega JWT de usuário nenhum).
interface PlatformMetrics {
  orgs_total: number;
  orgs_active: number;
  new_orgs_in_period: number;
  users_by_plan: { bot: number; jarvis: number; sem_plano: number };
  vgv_cents: number;
  sales_count: number;
  mrr_cents: number;
  renewal_rate_pct: number | null;
  online_now: number;
  avg_concurrent_users: number | null;
  activity_tracking_since: string | null;
}

// Mesmo motor de período do Dashboard de leads (src/lib/dashboard.ts), mas
// só com os presets que o dono pediu aqui — "pra ficar mais resumido" (o
// Dashboard de leads continua com a lista completa, incluindo 7d/15d/30d/
// etc.; esse recorte é só do painel do dono).
const ADMIN_PERIOD_PRESETS = PERIOD_PRESETS.filter((p) =>
  (['today', 'yesterday', 'this_week', 'this_month', 'last_month'] as PeriodKey[]).includes(p.key),
);

// Só VGV/vendas/novas orgs são escopados pelo período; MRR, orgs ativas,
// por plano e online-agora são sempre o estado ATUAL (não faz sentido "MRR
// de 30 dias atrás").
function MetricsGrid() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(
    () => periodRange(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.schema('whatsapp_hub').rpc('platform_admin_metrics', {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (cancelled) return;
      if (error) {
        toast.error('Falha ao carregar métricas', { description: error.message });
      } else {
        setMetrics(data as PlatformMetrics);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Métricas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] p-1 bg-white/[0.02]">
            {ADMIN_PERIOD_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodKey(p.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold',
                  periodKey === p.key
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriodKey('custom')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold',
                periodKey === 'custom'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              Personalizado
            </button>
          </div>
          {periodKey === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-[9.5rem]" />
              <span className="text-xs text-[var(--color-text-secondary)]">até</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-[9.5rem]" />
            </div>
          )}
        </div>
      </div>

      {loading || !metrics ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <MetricCard icon={Wallet} label="VGV no período" value={formatBRL(metrics.vgv_cents)} hint={`${metrics.sales_count} venda(s)`} />
            <MetricCard icon={TrendingUp} label="MRR (em dia)" value={formatBRL(metrics.mrr_cents)} hint="Valor atual" />
            <MetricCard icon={Building2} label="Orgs ativas" value={`${metrics.orgs_active} / ${metrics.orgs_total}`} hint="Total da instância" />
            <MetricCard icon={UserPlus} label="Novas orgs" value={String(metrics.new_orgs_in_period)} hint="No período" />
            <MetricCard
              icon={Percent}
              label="Renovação"
              value={metrics.renewal_rate_pct != null ? `${metrics.renewal_rate_pct}%` : '—'}
              hint="De quem já passou 1 ciclo"
            />
            <MetricCard
              icon={Users}
              label="Online agora"
              value={String(metrics.online_now)}
              hint={`Média: ${metrics.avg_concurrent_users ?? '—'}`}
            />
          </div>

          {/* Cartão próprio pra distribuição por plano — antes espremido numa
              linha só dentro do grid acima e cortava (bug reportado: "quantos
              pessoas tem em cada plano está cortado"). Aqui cada plano tem seu
              próprio bloco, sem limite de largura compartilhado. */}
          <div className="rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.15)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Users className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wide">Organizações por plano</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-display">{metrics.users_by_plan.bot}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Plano Bot</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-display">{metrics.users_by_plan.jarvis}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Plano Jarvis</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-display">{metrics.users_by_plan.sem_plano}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Sem plano</div>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.15)] p-4 text-center">
      <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">{label}</span>
      <div className="text-lg font-bold text-display leading-tight break-words">{value}</div>
      {hint && <div className="text-[11px] text-[var(--color-text-secondary)] opacity-70">{hint}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cupons de desconto — CRUD direto via RLS (coupons_super_admin), sem
// precisar de API route: quem chama já é o super admin com sessão real.
// ----------------------------------------------------------------------------
interface CouponRow {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  sold_cents: number;
  redemptions: number;
}

function CouponsSection() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabase();
    const { data: couponRows, error: couponsError } = await supabase
      .schema('whatsapp_hub')
      .from('coupons')
      .select('id, code, discount_type, discount_value, active, expires_at, created_at')
      .order('created_at', { ascending: false });
    if (couponsError) {
      toast.error('Falha ao carregar cupons', { description: couponsError.message });
      setLoading(false);
      return;
    }
    // Quanto cada cupom vendeu: agrega subscription_payments aprovados por
    // coupon_id (super admin lê tudo via RLS já existente na tabela).
    const { data: payments } = await supabase
      .schema('whatsapp_hub')
      .from('subscription_payments')
      .select('coupon_id, amount_cents, status')
      .not('coupon_id', 'is', null)
      .eq('status', 'approved');
    const soldByCoupon = new Map<string, { cents: number; count: number }>();
    for (const p of (payments ?? []) as { coupon_id: string; amount_cents: number }[]) {
      const cur = soldByCoupon.get(p.coupon_id) ?? { cents: 0, count: 0 };
      cur.cents += p.amount_cents;
      cur.count += 1;
      soldByCoupon.set(p.coupon_id, cur);
    }
    setCoupons(
      ((couponRows ?? []) as Omit<CouponRow, 'sold_cents' | 'redemptions'>[]).map((c) => ({
        ...c,
        sold_cents: soldByCoupon.get(c.id)?.cents ?? 0,
        redemptions: soldByCoupon.get(c.id)?.count ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(discountValue);
    if (!code.trim()) {
      toast.error('Informe o código do cupom.');
      return;
    }
    if (!value || value <= 0 || (discountType === 'percent' && value > 100)) {
      toast.error(discountType === 'percent' ? 'Percentual deve ser entre 1 e 100.' : 'Informe um valor de desconto em centavos maior que 0.');
      return;
    }
    setSaving(true);
    const supabase = getSupabase();
    const { error } = await supabase.schema('whatsapp_hub').from('coupons').insert({
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      discount_value: Math.round(value),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSaving(false);
    if (error) {
      toast.error('Falha ao criar cupom', {
        description: error.code === '23505' ? 'Já existe um cupom com esse código.' : error.message,
      });
      return;
    }
    toast.success('Cupom criado.');
    setCode('');
    setDiscountValue('');
    setExpiresAt('');
    setCreating(false);
    await load();
  };

  const handleToggleActive = async (coupon: CouponRow) => {
    const supabase = getSupabase();
    const { error } = await supabase
      .schema('whatsapp_hub')
      .from('coupons')
      .update({ active: !coupon.active })
      .eq('id', coupon.id);
    if (error) {
      toast.error('Falha ao atualizar cupom', { description: error.message });
      return;
    }
    await load();
  };

  const handleDelete = async (coupon: CouponRow) => {
    const ok = await confirm({
      title: 'Excluir cupom',
      description: `Excluir o cupom "${coupon.code}"? Isso não afeta pagamentos já feitos com ele.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const supabase = getSupabase();
    const { error } = await supabase.schema('whatsapp_hub').from('coupons').delete().eq('id', coupon.id);
    if (error) {
      toast.error('Falha ao excluir cupom', { description: error.message });
      return;
    }
    await load();
  };

  return (
    <Card>
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Tag className="h-4 w-4 text-[var(--accent-primary)]" /> Cupons de desconto
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Aplicados na tela de pagamento (Pix). Desconto vale só na cobrança em que foi usado.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> {creating ? 'Cancelar' : 'Novo cupom'}
          </Button>
        </header>

        {creating && (
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end border-t border-[rgba(var(--accent-secondary-rgb),0.1)] pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="coupon_code">Código</Label>
              <Input id="coupon_code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="LANCAMENTO20" disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon_type">Tipo</Label>
              <select
                id="coupon_type"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}
                disabled={saving}
                className="flex h-11 w-full items-center rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 text-sm"
              >
                <option value="percent">% percentual</option>
                <option value="fixed">R$ fixo (centavos)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon_value">{discountType === 'percent' ? 'Percentual (1-100)' : 'Centavos de desconto'}</Label>
              <Input id="coupon_value" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'percent' ? '20' : '1000'} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon_expires">Expira em (opcional)</Label>
              <Input id="coupon_expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} disabled={saving} />
            </div>
            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar cupom'}
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-sm text-[var(--color-text-secondary)] opacity-60 py-4 text-center">Carregando...</div>
        ) : coupons.length === 0 ? (
          <div className="text-sm text-[var(--color-text-secondary)] opacity-60 py-4 text-center">Nenhum cupom ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-label border-b border-[rgba(var(--accent-secondary-rgb),0.12)]">
                  <th className="text-left font-semibold pb-2 pr-4">Código</th>
                  <th className="text-left font-semibold pb-2 pr-4">Desconto</th>
                  <th className="text-left font-semibold pb-2 pr-4">Usos</th>
                  <th className="text-left font-semibold pb-2 pr-4">Vendido</th>
                  <th className="text-left font-semibold pb-2 pr-4">Status</th>
                  <th className="text-right font-semibold pb-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.08)]">
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-mono font-semibold">{c.code}</td>
                    <td className="py-2.5 pr-4 text-[var(--color-text-secondary)]">
                      {c.discount_type === 'percent' ? `${c.discount_value}%` : formatBRL(c.discount_value)}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--color-text-secondary)]">{c.redemptions}</td>
                    <td className="py-2.5 pr-4 text-[var(--color-text-secondary)]">{formatBRL(c.sold_cents)}</td>
                    <td className="py-2.5 pr-4">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(c)}
                        className={
                          c.active
                            ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[rgba(16,185,129,0.12)] text-[#10B981]'
                            : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-white/5 text-[var(--color-text-secondary)]'
                        }
                      >
                        {c.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="py-2.5 text-right">
                      <IconAction label="Excluir" onClick={() => void handleDelete(c)} icon={<Trash2 className="h-4 w-4" />} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--color-text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {icon}
    </button>
  );
}

function CreateOrgDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : slugify(name)),
    [slug, slugTouched, name],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome da organização.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          slug: effectiveSlug,
          adminEmail: adminEmail.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? 'Falha ao criar organização.');
      }
      if (body.warning) {
        toast.warning(body.warning);
      } else {
        toast.success('Organização criada.');
      }
      await onCreated();
    } catch (err) {
      toast.error('Falha ao criar organização', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Nova organização" opaque>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org_name">Nome</Label>
          <Input
            id="org_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Empresa Exemplo"
            disabled={saving}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org_slug">Slug</Label>
          <Input
            id="org_slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="empresa-exemplo"
            disabled={saving}
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            2 a 40 caracteres: letras minúsculas, números e hífen.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="org_admin">E-mail do admin inicial (opcional)</Label>
          <Input
            id="org_admin"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@empresa.com"
            disabled={saving}
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            Recebe um convite para definir a senha e administrar a organização.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Criando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Criar
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameOrgDialog({
  org,
  onClose,
  onSaved,
}: {
  org: OrgRow;
  onClose: () => void;
  onSaved: (name: string, slug: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome da organização.');
      return;
    }
    setSaving(true);
    await onSaved(name.trim(), slug.trim());
    setSaving(false);
  };

  return (
    <Dialog open onClose={onClose} title="Renomear organização" opaque>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rename_name">Nome</Label>
          <Input
            id="rename_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rename_slug">Slug</Label>
          <Input
            id="rename_slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
