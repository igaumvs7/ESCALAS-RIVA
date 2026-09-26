import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Bot,
  CheckCircle2,
  Clock,
  Frown,
  LayoutDashboard,
  MessageCircleQuestion,
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
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  hint?: string;
  featured?: boolean;
  index?: string;
}

function StatCard({ label, value, icon: Icon, color, hint, featured = false, index }: StatCardProps) {
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
      className={cn(
        'stat-card metric-card relative p-5 transition-transform duration-300 ease-out will-change-transform hover:-translate-y-1',
        featured && 'metric-card-featured',
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          {index && <div className="metric-index">{index}</div>}
          <div className="text-label mt-1">{label}</div>
        </div>
        <div className="metric-icon relative flex h-10 w-10 items-center justify-center" style={{ '--metric-color': color } as React.CSSProperties}>
          <div
            ref={glowRef}
            className="pointer-events-none absolute inset-0 rounded-full opacity-0"
            style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }}
            aria-hidden="true"
          />
          <div ref={iconRef} className="relative">
            <Icon className="h-[18px] w-[18px]" style={{ color }} />
          </div>
        </div>
      </div>
      <div
        className={cn('font-extrabold tracking-[-0.045em]', featured ? 'text-5xl sm:text-6xl' : 'text-3xl')}
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

function SectionHeading({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="dashboard-section-heading">
      <span>{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const metricsRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
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
    { scope: metricsRef },
  );

  return (
    <div className="dashboard-page mx-auto space-y-8">
      <section className="dashboard-intro">
        <div className="dashboard-intro-copy">
          <div className="dashboard-kicker"><span /> Vivas Intelligence</div>
          <div className="flex items-center gap-4">
            <div className="dashboard-title-mark">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1>Central de performance</h1>
              <p>Uma leitura clara da sua base, do atendimento e da conversão dos leads.</p>
            </div>
          </div>
        </div>
      </section>

      <div ref={metricsRef} className="space-y-10">
        <section className="dashboard-section">
          <SectionHeading index="01" title="Base operacional" description="A composição completa da sua carteira de contatos." />
          <div className="dashboard-base-grid">
            <StatCard featured index="TOTAL" label="Total de contatos" value={1247} icon={Users} color="var(--data-blue, #3B82F6)" hint="Todos, de qualquer período" />
            <StatCard index="01A" label="Alcançados via disparo" value={892} icon={Send} color="var(--accent-primary)" hint="Já receberam campanha alguma vez" />
            <StatCard index="01B" label="Espontâneos" value={213} icon={Sparkles} color="var(--data-green, #34D399)" hint="Já mandaram mensagem por conta própria" />
            <StatCard index="01C" label="Aguardando primeiro contato" value={142} icon={Clock} color="var(--data-orange, #FB923C)" hint="Nunca recebeu campanha nem mandou mensagem" />
          </div>
        </section>

        <section className="dashboard-section">
          <SectionHeading index="02" title="Movimento no período" description="Respostas, pendências e conversas conduzidas pela IA." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard index="02A" label="Responderam" value={347} icon={UserCheck} color="var(--data-green, #34D399)" hint="28% da base de contatos" />
            <StatCard index="02B" label="Não responderam" value={545} icon={UserX} color="var(--data-orange, #FB923C)" hint="De quem você já contatou (campanha ou 1:1)" />
            <StatCard index="02C" label="IA aguardando resposta" value={68} icon={Bot} color="var(--accent-primary)" hint="IA já falou, lead não respondeu ainda" />
          </div>
        </section>

        <section className="dashboard-section">
          <SectionHeading index="03" title="Qualificação" description="Como os leads avançaram depois do primeiro contato." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard index="03A" label="Transferido p/ humano" value={89} icon={MessageCircleQuestion} color="var(--accent-secondary)" hint="IA filtrou e passou a conversa pra você" />
            <StatCard index="03B" label="Demonstrou interesse" value={156} icon={Smile} color="var(--data-green, #34D399)" />
            <StatCard index="03C" label="Sem interesse" value={78} icon={Frown} color="var(--data-red, #F87171)" />
            <StatCard index="03D" label="Fechado" value={124} icon={CheckCircle2} color="var(--accent-primary)" hint="23 em aberto" />
          </div>
        </section>

        <section className="dashboard-section">
          <SectionHeading index="04" title="Resultado" description="O que já está pronto para acompanhamento comercial." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard index="04A" label="Leads qualificados" value={42} icon={Star} color="var(--accent-primary)" hint="Teve interesse, mas não fechou" />
            <StatCard index="04B" label="Vendas concluídas" value={18} icon={Trophy} color="var(--data-green, #34D399)" />
          </div>
        </section>

        <section className="tag-command-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="tag-command-icon"><TagIcon className="h-4 w-4" /></div>
            <div>
              <div className="text-sm font-bold">Leads por tag</div>
              <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">Distribuição rápida da sua base organizada</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { name: 'Alto padrão', count: 45 },
              { name: 'Lançamento', count: 38 },
              { name: 'Aluguel', count: 67 },
              { name: 'Investidor', count: 23 },
              { name: 'Minha Casa', count: 91 },
              { name: 'Comercial', count: 15 },
              { name: 'Terreno', count: 12 },
              { name: 'Permuta', count: 8 },
            ].map((tag) => (
              <div key={tag.name} className="tag-command-item flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="truncate font-medium">{tag.name}</span>
                <span className="ml-2 shrink-0 text-xs font-bold text-[var(--accent-primary)]">{tag.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
