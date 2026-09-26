import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';
import { isOrgOldEnough, NAV_GROUPS } from './nav-config';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { useSubscription } from '@/hooks/useSubscription';
import { getPlan } from '@/lib/plans';

gsap.registerPlugin(useGSAP);

const SUBSCRIPTION_STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'error' }> = {
  active: { label: 'Plano ativo', tone: 'success' },
  pending_first_payment: { label: 'Aguardando pagamento', tone: 'warning' },
  grace_period: { label: 'Pagamento pendente', tone: 'warning' },
  blocked: { label: 'Bloqueado', tone: 'error' },
  canceled: { label: 'Cancelado', tone: 'error' },
};

function toneClasses(tone: 'success' | 'warning' | 'error'): string {
  if (tone === 'success') return 'bg-[rgba(16,185,129,0.14)] text-[var(--color-success)]';
  if (tone === 'warning') return 'bg-[rgba(245,158,11,0.14)] text-[#FBBF24]';
  return 'bg-[rgba(239,68,68,0.14)] text-[var(--color-error)]';
}

// "Robozinho" do rodapé — pedido do dono (2026-09-06): "queria que essa
// parte ficasse mais bonita... se puder colocar o robozinho do plano de
// cada pessoa". Reaproveita a marca (logo-mark.png) — sem asset novo — com
// tratamento visual DIFERENTE por plano, no mesmo espírito já estabelecido
// em PlanCard.tsx ("Bot é deliberadamente neutro/discreto... Jarvis ganha
// borda em degradê, selo"): Jarvis ganha brilho dourado; Bot fica
// dessaturado/discreto; sem plano (org isenta de billing) fica neutro.
function PlanMascot({ plan }: { plan: 'bot' | 'jarvis' | null | undefined }) {
  if (plan === 'jarvis') {
    return (
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--accent-primary-rgb),0.4)] bg-[rgba(var(--accent-primary-rgb),0.1)]">
        <div
          className="absolute inset-0 rounded-xl opacity-40 blur-md"
          style={{ background: 'var(--accent-primary)' }}
          aria-hidden="true"
        />
        <img src="/logo-mark.png" alt="" className="relative h-5 w-5 object-contain" />
      </div>
    );
  }
  if (plan === 'bot') {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
        <img src="/logo-mark.png" alt="" className="h-5 w-5 object-contain opacity-60 grayscale" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.02]">
      <img src="/logo-mark.png" alt="" className="h-5 w-5 object-contain opacity-70" />
    </div>
  );
}

const EXPANDED_WIDTH = 296; // alargada pra caber a wordmark maior + mais respiro
const COLLAPSED_WIDTH = 64; // w-16
const HEADER_PAD = 20; // px-5
const HEADER_GAP = 18; // espaço entre a logo e a wordmark
const LABEL_WIDTH = 200; // largura máx. revelada dos rótulos (texto e wordmark)
const LOGO_SIZE_EXPANDED = 36; // h-9 — ao lado da wordmark
const LOGO_SIZE_COLLAPSED = 44; // maior quando é só ela sozinha na régua (pedido do dono)

// ----------------------------------------------------------------------------
// Sidebar — recolher/expandir migrado pra GSAP (skill gsap-core/gsap-timeline,
// 2026-08-24). Antes eram 4 transições CSS independentes (largura da barra,
// padding do cabeçalho, padding de cada item, opacidade do texto) rodando
// cada uma no seu próprio relógio — o texto podia ficar visível cortado a
// meio caminho enquanto a barra ainda estava encolhendo (bug reportado:
// "fica desconfigurada"). Um timeline GSAP sequencia isso de propósito:
// ao RECOLHER, o texto some primeiro (rápido) e só DEPOIS a barra encolhe;
// ao EXPANDIR, a barra abre primeiro e o texto aparece só quando já tem
// espaço. Nunca existe um instante com texto cortado.
// ----------------------------------------------------------------------------
export function Sidebar() {
  const navigate = useNavigate();
  const { role, isSuperAdmin, orgName, orgCreatedAt } = useAppUser();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === '1',
  );
  const asideRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const didMount = useRef(false);

  const toggle = () =>
    setCollapsed((v) => {
      localStorage.setItem('sidebar_collapsed', v ? '0' : '1');
      return !v;
    });

  useGSAP(
    () => {
      const labels = gsap.utils.toArray<HTMLElement>('.sidebar-label', asideRef.current);

      // O gap/padding ícone↔texto dos itens de menu NÃO é mais controlado
      // por aqui (bug real reportado: "às vezes abre e volta a ficar tudo
      // junto, recarrega e buga de novo"). Causa: o `gsap.context` interno
      // do useGSAP reverte (`.revert()`) todo `gsap.set`/tween criado nele
      // sempre que esse efeito re-executa ou desmonta — inclusive o
      // `gsap.set` da 1ª montagem, que só roda UMA vez. Isso deixava esse
      // valor vulnerável a qualquer desmontagem espúria da sidebar (ex.:
      // Suspense — já corrigido — ou qualquer futura). Agora esse espaço é
      // uma classe Tailwind comum (`gap-*`/`px-*` no JSX abaixo, com
      // `transition-[...]` fazendo a animação em CSS puro) — 100%
      // determinístico a partir do estado React `collapsed`, nunca fica
      // "preso" num valor errado depois de remontar.
      if (!didMount.current) {
        // 1ª montagem: aplica o estado salvo direto, sem animar (sem
        // transição visível no carregamento da página).
        gsap.set(asideRef.current, { width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH });
        gsap.set(headerRef.current, { paddingLeft: collapsed ? 0 : HEADER_PAD, paddingRight: collapsed ? 0 : HEADER_PAD, gap: collapsed ? 0 : HEADER_GAP });
        gsap.set(labels, { autoAlpha: collapsed ? 0 : 1, width: collapsed ? 0 : LABEL_WIDTH });
        gsap.set(logoRef.current, { width: collapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE_EXPANDED, height: collapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE_EXPANDED });
        gsap.set(toggleBtnRef.current, { left: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH });
        didMount.current = true;
        return;
      }

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce)', () => {
        // Sem animação: aplica o estado final na hora.
        gsap.set(asideRef.current, { width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH });
        gsap.set(headerRef.current, { paddingLeft: collapsed ? 0 : HEADER_PAD, paddingRight: collapsed ? 0 : HEADER_PAD, gap: collapsed ? 0 : HEADER_GAP });
        gsap.set(labels, { autoAlpha: collapsed ? 0 : 1, width: collapsed ? 0 : LABEL_WIDTH });
        gsap.set(logoRef.current, { width: collapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE_EXPANDED, height: collapsed ? LOGO_SIZE_COLLAPSED : LOGO_SIZE_EXPANDED });
        gsap.set(toggleBtnRef.current, { left: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH });
      });
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { duration: 0.28, ease: 'power3.inOut' } });

        if (collapsed) {
          tl.to(labels, { autoAlpha: 0, width: 0, duration: 0.12, ease: 'power1.out' })
            .to(asideRef.current, { width: COLLAPSED_WIDTH }, '<')
            .to(headerRef.current, { paddingLeft: 0, paddingRight: 0, gap: 0 }, '<')
            .to(logoRef.current, { width: LOGO_SIZE_COLLAPSED, height: LOGO_SIZE_COLLAPSED }, '<')
            .to(toggleBtnRef.current, { left: COLLAPSED_WIDTH }, '<');
        } else {
          tl.to(asideRef.current, { width: EXPANDED_WIDTH })
            .to(headerRef.current, { paddingLeft: HEADER_PAD, paddingRight: HEADER_PAD, gap: HEADER_GAP }, '<')
            .to(logoRef.current, { width: LOGO_SIZE_EXPANDED, height: LOGO_SIZE_EXPANDED }, '<')
            .to(toggleBtnRef.current, { left: EXPANDED_WIDTH }, '<')
            .to(labels, { autoAlpha: 1, width: LABEL_WIDTH, duration: 0.2 }, '-=0.12');
        }
        return () => tl.kill();
      });

      return () => mm.revert();
    },
    { dependencies: [collapsed], scope: asideRef },
  );

  const { subscription } = useSubscription();
  // Sem linha em subscriptions = org isenta de billing — não restringe por
  // plano nesse caso (ver mesma regra em RequireActiveSubscription).
  const isBotPlan = subscription?.plan === 'bot';
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (item.adminOnly && role !== 'admin') return false;
      if (item.requiresJarvis && isBotPlan) return false;
      if (item.requiresOrgAgeHours && !isOrgOldEnough(orgCreatedAt, item.requiresOrgAgeHours)) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  // Item condicional (ex. Feedback, requiresOrgAgeHours) pode nascer DEPOIS
  // da 1ª montagem, quando orgCreatedAt termina de carregar de forma
  // assíncrona — seu rótulo perdia o estado recolhido/expandido porque o
  // efeito abaixo só roda ao alternar `collapsed`. Essa chave muda sempre
  // que o conjunto de itens visíveis muda, sincronizando o novo rótulo sem
  // reanimar a barra inteira (bug real: "F..." cortado em cima do ícone).
  const visibleItemsKey = groups.flatMap((g) => g.items.map((i) => i.to)).join(',');
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  useEffect(() => {
    if (!didMount.current) return; // 1ª montagem já é tratada pelo useGSAP acima
    const labels = gsap.utils.toArray<HTMLElement>('.sidebar-label', asideRef.current);
    gsap.set(labels, {
      autoAlpha: collapsedRef.current ? 0 : 1,
      width: collapsedRef.current ? 0 : LABEL_WIDTH,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItemsKey]);

  return (
    <aside
      ref={asideRef}
      className="app-sidebar hidden md:flex md:flex-col shrink-0 overflow-hidden"
      aria-label="Navegação principal"
    >
      <div
        ref={headerRef}
        className={cn(
          'sidebar-brand h-20 flex items-center overflow-hidden',
          collapsed && 'justify-center',
        )}
      >
        <img ref={logoRef} src="/logo-mark.png" alt="VIVAS" className="h-9 w-9 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(var(--accent-secondary-rgb),0.35)]" />
        {/* Arte de verdade da wordmark (com o traço azul no V, igual ao
            design original) em vez de recriar isso em CSS — mais fiel e
            mais simples de manter. Versão "dark" (VIVAS recolorido pra
            branco) pra ler contra o fundo escuro.
            Wrapper com tamanho FIXO por dentro + overflow-hidden no rótulo
            (que é quem tem o width animado pelo GSAP) — evita a imagem
            "encolher" junto (object-fit reagiria à largura variável); aqui
            só revela/esconde por corte, exatamente como o texto fazia antes. */}
        <div className="sidebar-label shrink-0 overflow-hidden">
          <img src="/logo-wordmark-dark.png" alt="VIVAS CONNECT" className="h-6 w-auto max-w-none" />
        </div>
      </div>

      {/* Pedido do dono (2026-09-06): "não quero isso [rolagem], eu quero
          tudo fixo e parado". Espaçamento vertical apertado (nav/itens/
          divisórias) pra caber sem scroll na prática. MESMO ASSIM a barra
          continuava aparecendo (2ª reclamação, com print): "aqui o scroll já
          não está sendo mais necessário mas mesmo assim ela ainda
          persiste" — o SO/navegador reserva a faixa da barra mesmo sem
          overflow de verdade (comum no Windows com "sempre mostrar barra de
          rolagem" ligado). `sidebar-nav-scroll` (globals.css) esconde a
          barra visualmente em qualquer navegador/SO, sem tirar
          `overflow-y-auto` — se algum dia precisar rolar de verdade (tela
          minúscula), o mouse/trackpad ainda rola, só não aparece a barra. */}
      {/* Pedido do dono (2026-09-06, 3ª rodada — print comparando 1920x1080 x
          1366x768): "isso é tudo nada a ver um com o outro... é possível
          isso ser ajustável automaticamente... sempre bem preenchido e
          bonito". Espaçamento fixo e apertado (rodadas anteriores) cabia
          sem rolar em QUALQUER tela, mas em monitores grandes sobrava um
          vão vazio enorme entre o último item e o rodapé — parecia
          "esquecido", bem diferente do visual compacto no notebook menor.
          `clamp()` faz cada espaçamento crescer com a altura da tela (vh):
          no mínimo, o valor já testado sem rolagem (notebook pequeno); no
          máximo, bem mais respirado (monitor grande) — nunca ultrapassa o
          teto, então nunca volta a precisar de scroll. */}
      <nav className="sidebar-navigation sidebar-nav-scroll flex-1 min-h-0 flex flex-col overflow-y-auto px-3 py-3 space-y-[clamp(0.35rem,1.25vh,1.5rem)]">
        {groups.map((group, gi) => (
          <div key={group.label} className="sidebar-group space-y-[clamp(0.15rem,0.55vh,0.45rem)]">
            {/* Linha divisória entre seções — sempre visível (expandida ou
                recolhida), não só no modo recolhido como antes. Pedido do
                dono: "divisão mais exposta" entre os tópicos. */}
            {gi > 0 && (
              <div className="sidebar-group-rule mx-2 mb-[clamp(0.35rem,0.9vh,1rem)] h-px" />
            )}
            <div className="sidebar-group-label sidebar-label overflow-hidden whitespace-nowrap px-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'sidebar-navitem relative flex items-center py-[clamp(0.42rem,1vh,0.72rem)] overflow-hidden text-sm font-semibold',
                      'transition-[color,background-color,gap,padding-left,padding-right] duration-300 ease-out',
                      collapsed ? 'justify-center gap-0 px-0' : 'gap-3 px-2.5',
                      'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                      isActive &&
                        'sidebar-navitem-active text-[var(--color-text-primary)]',
                    )
                  }
                >
                  <span className="sidebar-icon-frame">
                    <Icon className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="sidebar-label truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Rodapé — antes repetia a mesma identidade pessoal (nome/cargo/sair)
          já mostrada no canto superior direito (Header/UserMenu), o que o
          dono achou redundante (2026-09-05: "fica repetindo meu usuário da
          conta"). Depois virou nome do negócio + status do plano, mas só em
          texto solto — o dono achou "seco, sem detalhes" (2026-09-06) e
          pediu um robozinho do plano + mais organizado. Agora é um cartão
          com o mascote (ver PlanMascot acima), clicável pra admin (leva pra
          /planos — ação nova, antes o rodapé não fazia nada ao clicar). */}
      <div className={cn('sidebar-footer shrink-0 p-2.5', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={() => role === 'admin' && navigate('/planos')}
          title={role === 'admin' ? 'Ver planos' : orgName ?? undefined}
          className={cn(
            'sidebar-plan-card flex w-full items-center p-2 text-left transition-colors',
            role === 'admin' ? 'cursor-pointer' : 'cursor-default',
            collapsed ? 'justify-center gap-0' : 'gap-2.5',
          )}
        >
          <PlanMascot plan={subscription?.plan} />
          <div className={cn('sidebar-label min-w-0 overflow-hidden whitespace-nowrap', collapsed ? 'flex-none' : 'flex-1')}>
            <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
              {orgName || '—'}
            </div>
            {role === 'admin' && subscription ? (
              <span
                className={cn(
                  'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold',
                  toneClasses((SUBSCRIPTION_STATUS_META[subscription.status] ?? SUBSCRIPTION_STATUS_META.active).tone),
                )}
              >
                {subscription.plan ? `${getPlan(subscription.plan).name} · ` : ''}
                {(SUBSCRIPTION_STATUS_META[subscription.status] ?? SUBSCRIPTION_STATUS_META.active).label}
              </span>
            ) : (
              role === 'admin' && (
                <div className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">Ver planos</div>
              )
            )}
          </div>
        </button>
      </div>

      {/* Seta flutuante fixa no centro VERTICAL DA TELA (fixed), deslizando
          junto com a borda direita da barra (left = largura da sidebar,
          animado pelo mesmo timeline acima). */}
      <button
        ref={toggleBtnRef}
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        className="sidebar-toggle fixed top-1/2 z-30 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] md:flex"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
