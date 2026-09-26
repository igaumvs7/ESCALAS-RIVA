import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Bot,
  CheckCircle2,
  Clock,
  Frown,
  LayoutDashboard,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  Smile,
  Sparkles,
  Star,
  Tag as TagIcon,
  Trophy,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useLeadsDashboard } from '@/hooks/useLeadsDashboard';
import { PERIOD_PRESETS, periodRange, type PeriodKey } from '@/lib/dashboard';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { SegmentDetailDialog, type ContactSegment } from '@/components/dashboard/SegmentDetailDialog';
import { cn } from '@/lib/utils';

function isPeriodKey(v: string | null): v is PeriodKey {
  return v === 'today' || v === 'yesterday' || v === 'this_week' || v === 'last_week' || v === '1d' || v === '7d' || v === '15d' || v === '30d' || v === '60d' || v === '90d' || v === 'this_month' || v === 'last_month' || v === 'custom';
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  hint?: string;
  // Pedido do dono (2026-09-06): poder clicar nos cards de base de contatos
  // (Total/Alcançados/Espontâneos) e ver o detalhe daquele grupo. Só os
  // cards com onClick ganham o cursor de clique e o selo "Clique aqui" no
  // canto — os outros (funil de atividade) continuam só informativos.
  onClick?: () => void;
}

gsap.registerPlugin(useGSAP);

// Mesmo tratamento de hover dos cards de Ferramentas (pedido do dono,
// depois de aprovar aquela grade: "coloque essa animação em outras coisas
// do sistema") — ícone com leve glow/escala, card levanta um pouco. Usa a
// cor PRÓPRIA de cada métrica (`color`, já fixa por design — dado não
// segue tema), não o accent do tema.
function StatCard({ label, value, icon: Icon, color, hint, onClick }: StatCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        tlRef.current = gsap
          .timeline({ paused: true, defaults: { ease: 'power2.out', duration: 0.3 } })
          .to(iconRef.current, { scale: 1.15, rotate: -6 }, 0)
          .to(glowRef.current, { autoAlpha: 1, scale: 1.2 }, 0);
        return () => tlRef.current?.kill();
      });
      return () => mm.revert();
    },
    { scope: cardRef },
  );

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => tlRef.current?.play()}
      onMouseLeave={() => tlRef.current?.reverse()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        'stat-card glass-card relative p-5 transition-transform duration-300 ease-out will-change-transform hover:-translate-y-1',
        onClick && 'cursor-pointer',
      )}
    >
      {onClick && (
        <span className="absolute -top-2 right-3 rounded-full border border-[rgba(var(--accent-secondary-rgb),0.35)] bg-[var(--color-bg-primary)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--accent-secondary)]">
          Clique aqui
        </span>
      )}
      <div className="flex items-center justify-between mb-3">
        <div className="text-label">{label}</div>
        <div className="relative flex h-7 w-7 items-center justify-center">
          <div
            ref={glowRef}
            className="pointer-events-none absolute inset-0 rounded-full opacity-0"
            style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }}
            aria-hidden="true"
          />
          <div ref={iconRef} className="relative">
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
        </div>
      </div>
      <div
        className="text-3xl font-extrabold tracking-tight"
        style={{
          background: `linear-gradient(135deg, var(--color-text-primary) 45%, ${color})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {value.toLocaleString('pt-BR')}
      </div>
      {hint && <div className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{hint}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const periodKey: PeriodKey = isPeriodKey(params.get('period')) ? (params.get('period') as PeriodKey) : '30d';
  const customFrom = params.get('from') ?? '';
  const customTo = params.get('to') ?? '';

  const range = useMemo(
    () => periodRange(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );

  const { metrics, loading, error, reload } = useLeadsDashboard(range);
  const [refreshing, setRefreshing] = useState(false);
  const [openSegment, setOpenSegment] = useState<ContactSegment | null>(null);
  const metricsRef = useRef<HTMLDivElement>(null);

  // Entrada dos cards de métrica em cascata quando os dados terminam de
  // carregar (skill gsap-core: stagger). Só roda na transição loading→pronto,
  // não em todo re-render (dependencies: [loading]).
  useGSAP(
    () => {
      if (loading) return;
      const cards = gsap.utils.toArray<HTMLElement>('.stat-card', metricsRef.current);
      if (cards.length === 0) return;
      gsap.from(cards, {
        autoAlpha: 0,
        y: 14,
        duration: 0.4,
        ease: 'power2.out',
        stagger: { each: 0.05, from: 'start' },
      });
    },
    { scope: metricsRef, dependencies: [loading] },
  );

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(params);
    next.set('period', key);
    if (key !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  const setCustom = (which: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    next.set('period', 'custom');
    next.set(which, value);
    setParams(next, { replace: true });
  };

  const respondedPct = metrics.totalContacts > 0 ? Math.round((metrics.responded / metrics.totalContacts) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="text-label">Seção</div>
            <h1 className="text-2xl font-bold text-display">Dashboard</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">Leads e atendimento</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Bug real reportado (2026-08-31, print no celular): sem
            overflow-x-auto, esse grupo de botões não cabia numa tela
            estreita e vazava pra fora, cortado sem nem dar pra rolar até o
            fim ("15", "30", "Personalizado" ficavam inacessíveis). */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] p-1 bg-white/[0.02]">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold',
                periodKey === p.key
                  ? 'bg-[var(--accent-primary)] text-[var(--color-bg-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold',
              periodKey === 'custom'
                ? 'bg-[var(--accent-primary)] text-[var(--color-bg-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            Personalizado
          </button>
        </div>
        {periodKey === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustom('from', e.target.value)}
              className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            />
            <span className="text-xs text-[var(--color-text-secondary)]">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustom('to', e.target.value)}
              className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            />
          </div>
        )}
      </div>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading ? (
        <div className="glass-card p-10 text-center text-label opacity-60">Carregando métricas...</div>
      ) : (
        <div ref={metricsRef} className="space-y-4">
          {/* Base de contatos — pedido do dono (2026-09-06, 3ª rodada, depois
              de achar um bug real): uma lista importada e nunca contatada
              contava como "espontânea" só por nunca ter recebido campanha.
              Agora são 4 grupos que sempre somam o total: alcançados (já
              recebeu campanha alguma vez), espontâneos (nunca recebeu
              campanha, mas já mandou mensagem por conta própria) e aguardando
              primeiro contato (nem campanha, nem nunca mandou mensagem — lista
              parada). Os 4 SEMPRE ignoram o período selecionado acima (é a
              base de contatos inteira, sempre). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total de contatos" value={metrics.totalContacts} icon={Users} color="var(--data-blue, #3B82F6)" hint="Todos, de qualquer período" onClick={() => setOpenSegment('total')} />
            <StatCard label="Alcançados via disparo em massa" value={metrics.reachedViaCampaign} icon={Send} color="var(--accent-primary)" hint="Já receberam campanha alguma vez" onClick={() => setOpenSegment('campaign')} />
            <StatCard label="Espontâneos" value={metrics.spontaneousContacts} icon={Sparkles} color="var(--data-green, #34D399)" hint="Já mandaram mensagem por conta própria" onClick={() => setOpenSegment('spontaneous')} />
            <StatCard label="Aguardando primeiro contato" value={metrics.awaitingFirstContact} icon={Clock} color="var(--data-orange, #FB923C)" hint="Nunca recebeu campanha nem mandou mensagem" onClick={() => setOpenSegment('awaiting')} />
          </div>

          {/* Fileira 1 — atividade no período selecionado acima */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Responderam" value={metrics.responded} icon={UserCheck} color="var(--data-green, #34D399)" hint={`${respondedPct}% da base de contatos`} />
            <StatCard label="Não responderam" value={metrics.notResponded} icon={UserX} color="var(--data-orange, #FB923C)" hint="De quem você já contatou (campanha ou 1:1)" />
            <StatCard label="IA aguardando resposta" value={metrics.waitingAi} icon={Bot} color="var(--accent-primary)" hint="IA já falou, lead não respondeu ainda" />
          </div>

          {/* Fileira 2 — qualificação e status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Transferido p/ humano" value={metrics.transferredHuman} icon={MessageCircleQuestion} color="var(--accent-secondary)" hint="IA filtrou e passou a conversa pra você" />
            <StatCard label="Demonstrou interesse" value={metrics.interested} icon={Smile} color="var(--data-green, #34D399)" />
            <StatCard label="Sem interesse" value={metrics.notInterested} icon={Frown} color="var(--data-red, #F87171)" />
            <StatCard label="Fechado" value={metrics.closed} icon={CheckCircle2} color="var(--accent-primary)" hint={`${metrics.open} em aberto`} />
          </div>

          {/* Fileira 3 — resultado do lead */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Leads qualificados" value={metrics.qualified} icon={Star} color="var(--accent-primary)" hint="Teve interesse, mas não fechou" />
            <StatCard label="Vendas concluídas" value={metrics.sold} icon={Trophy} color="var(--data-green, #34D399)" />
          </div>

          {/* Contagem por tag */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TagIcon className="h-4 w-4 text-[var(--accent-primary)]" />
              <div className="text-sm font-bold">Leads por tag</div>
            </div>
            {metrics.byTag.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Nenhuma tag em uso ainda. Crie tags em Contatos e marque seus leads pra ver a contagem aqui.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {metrics.byTag.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                    style={{
                      borderColor: t.color ? `${t.color}55` : 'rgba(var(--accent-secondary-rgb),0.3)',
                      background: t.color ? `${t.color}18` : 'rgba(var(--accent-secondary-rgb),0.08)',
                    }}
                  >
                    <span className="font-semibold" style={{ color: t.color ?? 'var(--color-text-primary)' }}>{t.name}</span>
                    <span className="text-[var(--color-text-secondary)]">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <SegmentDetailDialog segment={openSegment} range={range} totalContacts={metrics.totalContacts} onClose={() => setOpenSegment(null)} />
    </div>
  );
}
