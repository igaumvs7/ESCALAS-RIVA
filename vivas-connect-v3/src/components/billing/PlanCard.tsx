import { useRef } from 'react';
import { Minus } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LAUNCH_PRICING_ACTIVE, formatBRL, type PlanDef } from '@/lib/plans';

gsap.registerPlugin(useGSAP);

interface PlanCardProps {
  plan: PlanDef;
  highlight?: boolean;
  current?: boolean;
  actionLabel?: string;
  onSelect?: () => void;
  loading?: boolean;
}

// Redesenho completo do card de plano (feedback direto do dono: "esta
// terrivelmente feio... parece que foi uma criança que fez, totalmente
// amador"). Além da animação por hover (já existia), agora cada plano tem
// uma IDENTIDADE VISUAL própria: Bot é deliberadamente neutro/discreto
// (reforça "mais simples"), Jarvis ganha borda em degradê giratório, selo,
// ícone próprio por recurso (não só um Check genérico) e hierarquia
// tipográfica mais forte no preço.
//
// Estrutura ÚNICA pros dois planos (mesmo <div> raiz, sem wrapper extra só
// pro Jarvis) — antes o Jarvis tinha um wrapper próprio (só pra desenhar a
// borda giratória) com sua PRÓPRIA altura, que podia dessincronizar da
// altura do Bot (calculada pelo grid) e cortar conteúdo do Jarvis (bug
// reportado: "informação sendo cortada"). Com os dois no mesmo tipo de
// caixa, o `overflow-hidden` de cada card só pode cortar o PRÓPRIO
// conteúdo dele — nunca o do outro.
export function PlanCard({ plan, highlight, current, actionLabel = 'Escolher esse plano', onSelect, loading }: PlanCardProps) {
  const robotRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const isJarvis = plan.id === 'jarvis';

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Hover: NÃO usa `y` no Jarvis de propósito — quem cuida do eixo Y ali
      // é o flutuar contínuo abaixo, pra não brigar (duas tweens na mesma
      // propriedade do mesmo alvo = disputa/tremedeira).
      tlRef.current =
        plan.id === 'bot'
          ? gsap
              .timeline({ paused: true, repeat: -1, defaults: { ease: 'power1.inOut' } })
              .to(robotRef.current, { rotation: -8, duration: 0.16 })
              .to(robotRef.current, { rotation: 8, duration: 0.16 })
              .to(robotRef.current, { rotation: -8, duration: 0.16 })
              .to(robotRef.current, { rotation: 0, duration: 0.16 })
              .to(glowRef.current, { autoAlpha: 0.7, scale: 1.1, duration: 0.3 }, 0)
              .to(glowRef.current, { autoAlpha: 0.3, scale: 0.95, duration: 0.34 }, 0.3)
          : gsap
              .timeline({ paused: true, repeat: -1, defaults: { ease: 'sine.inOut' } })
              .to(robotRef.current, { rotationY: 18, scale: 1.08, transformPerspective: 500, duration: 0.7 }, 0)
              .to(robotRef.current, { rotationY: -18, scale: 1, duration: 0.7 }, 0.7)
              .to(glowRef.current, { autoAlpha: 0.9, scale: 1.4, duration: 0.9 }, 0)
              .to(glowRef.current, { autoAlpha: 0.45, scale: 1, duration: 0.5 }, 0.9);

      // Jarvis "mexe sozinho" mesmo sem hover — pedido do dono: "eu queria
      // até que ele mexesse, mas algo simples" (2026-08-24). O robô flutua
      // (idleFloat) — mantido. O brilho passando pelo card e a borda
      // giratória foram removidos depois (2026-08-31: "tira essa animação
      // do background do plano... deixar a animação dos robôs") — a borda
      // em degradê continua, só parada num ângulo fixo em vez de girar.
      if (isJarvis) {
        const idleFloat = gsap.to(robotRef.current, {
          y: -5,
          duration: 1.8,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
        return () => {
          idleFloat.kill();
        };
      }

      return () => tlRef.current?.kill();
    });
    return () => mm.revert();
  }, [plan.id]);

  const handleEnter = () => tlRef.current?.play();
  const handleLeave = () => {
    tlRef.current?.pause(0);
    // Sem `y` aqui — no Jarvis, `y` pertence ao flutuar contínuo (ver acima);
    // resetar ele aqui pausaria/travaria esse loop.
    gsap.to([robotRef.current, glowRef.current], { rotation: 0, rotationY: 0, scale: 1, autoAlpha: 0.35, duration: 0.25 });
  };

  const price = LAUNCH_PRICING_ACTIVE ? plan.launchPriceCents : plan.regularPriceCents;

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={cn(
        // SEM overflow-hidden aqui: a faixa "Recomendado" precisa poder
        // vazar pra CIMA da borda do card (posição negativa, -top-3) — com
        // overflow-hidden ela ficava cortada pela metade (bug reportado com
        // print). Não precisa dele por segurança: o anel do Jarvis usa
        // `mask`, não `overflow-hidden`, pra se recortar (ver comentário
        // abaixo) — já é autocontido, nunca vaza sozinho.
        'relative flex h-full flex-col gap-5 rounded-[1.4rem] p-7 transition-[transform,box-shadow] duration-300 ease-out will-change-transform',
        'hover:-translate-y-1.5',
        isJarvis
          ? 'shadow-[0_20px_60px_rgba(0,0,0,0.35)] hover:shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_28px_rgba(var(--accent-primary-rgb),0.12)]'
          : [
              'border border-[rgba(var(--accent-secondary-rgb),0.25)] hover:border-[rgba(var(--accent-primary-rgb),0.45)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.3),0_0_24px_rgba(var(--accent-primary-rgb),0.08)]',
              // Bot é deliberadamente neutro (sem acento colorido) — mas o
              // tom de base precisa seguir o tema (pedido do dono,
              // 2026-09-06: "todos os painéis e menus, tudo tem que estar
              // alinhado e sincronizado"). Antes era #10131f/#141a2c fixos,
              // iguais em qualquer tema.
              'bg-[color-mix(in_srgb,var(--color-bg-primary)_88%,white_12%)]',
              'hover:bg-[color-mix(in_srgb,var(--color-bg-primary)_78%,white_22%)]',
            ],
      )}
      style={
        isJarvis
          ? { background: 'linear-gradient(165deg, rgba(var(--accent-primary-rgb),0.16), color-mix(in srgb, var(--color-bg-primary) 95%, transparent) 55%)' }
          : undefined
      }
    >
      {/* Borda em degradê giratório — só no Jarvis, reforça "plano completo/
          premium" sem repetir o efeito de "holofote"/glow que o dono
          rejeitou (aqui é uma borda fina, não um círculo de luz seguindo o
          cursor). Técnica de máscara (2 camadas + `mask-composite: exclude`)
          recorta sozinha um anel fino do próprio tamanho deste div — não
          depende de `overflow-hidden` no card pra se comportar (por isso o
          card em si NÃO tem overflow-hidden: precisa deixar a faixa
          "Recomendado" vazar pra cima da borda, ver acima). */}
      {isJarvis && (
        <div
          ref={borderRef}
          className="pointer-events-none absolute inset-0 rounded-[1.4rem]"
          style={
            {
              '--border-angle': 0,
              padding: '1.5px',
              background:
                'conic-gradient(from calc(var(--border-angle) * 1deg), var(--accent-primary), rgba(var(--accent-secondary-rgb),0.6), transparent 45%, transparent 55%, var(--accent-primary))',
              WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      )}

      {highlight && (
        <span className="absolute -top-3 right-6 flex items-center gap-1 rounded-full bg-[var(--accent-primary)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--accent-primary-contrast)] shadow-[0_4px_16px_rgba(var(--accent-primary-rgb),0.5)]">
          ★ Recomendado
        </span>
      )}

      <span
        className={cn(
          'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]',
          isJarvis
            ? 'bg-[rgba(var(--accent-primary-rgb),0.16)] text-[var(--accent-primary)]'
            : 'bg-white/[0.08] text-[var(--color-text-secondary)]',
        )}
      >
        {plan.badge}
      </span>

      {/* Robô visualmente diferente por plano, não só a animação (pedido do
          dono: "o BOT seja mais simples e o JARVIS seja mais top"). Tile
          quadrado com cantos arredondados (não mais um círculo solto) —
          leitura mais "produto de software", menos "ícone de app avulso".
          Um SÓ elemento animado aqui (o glow, no hover) — o anel giratório
          já fica na borda do card inteiro; repetir outro giro pequeno aqui
          dentro deixava a leitura "pesada" (feedback do dono). */}
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
          <div
            className={cn(
              'absolute inset-0 rounded-2xl',
              isJarvis ? 'border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[var(--color-bg-primary)]' : 'border border-white/12 bg-white/[0.06]',
            )}
            aria-hidden="true"
          />
          <div
            ref={glowRef}
            className="absolute inset-2 rounded-xl opacity-35"
            style={{
              background: `radial-gradient(circle, rgba(var(--${plan.id === 'bot' ? 'accent-secondary-rgb' : 'accent-primary-rgb'}),0.55), transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <img
            ref={robotRef}
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            className={cn(
              'relative h-9 w-9 object-contain',
              plan.id === 'bot' ? 'opacity-75 grayscale contrast-[0.9]' : 'drop-shadow-[0_0_10px_rgba(var(--accent-primary-rgb),0.6)]',
            )}
          />
        </div>

        <div>
          <h3 className="text-lg font-bold text-display">{plan.name}</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">{plan.tagline}</p>
        </div>
      </div>

      <div>
        {LAUNCH_PRICING_ACTIVE && (
          <div className="text-sm text-[var(--color-text-secondary)] line-through opacity-60">
            {formatBRL(plan.regularPriceCents)}/mês
          </div>
        )}
        <div
          className={cn(
            'text-4xl font-extrabold tracking-tight',
            isJarvis
              ? 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-transparent'
              : 'text-display',
          )}
        >
          {formatBRL(price)}
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">/mês</span>
        </div>
        {LAUNCH_PRICING_ACTIVE && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[rgba(var(--accent-primary-rgb),0.1)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-primary)]">
            Preço de lançamento
          </div>
        )}
      </div>

      <div className={cn('h-px w-full', isJarvis ? 'bg-[rgba(var(--accent-primary-rgb),0.15)]' : 'bg-white/[0.08]')} />

      <ul className="flex flex-1 flex-col gap-3 text-sm">
        {plan.features.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                isJarvis ? 'bg-[rgba(var(--accent-primary-rgb),0.14)] text-[var(--accent-primary)]' : 'bg-white/[0.08] text-[var(--color-text-secondary)]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className={cn(isJarvis && 'font-medium', 'pt-0.5 text-[var(--color-text-primary)]')}>{text}</span>
          </li>
        ))}
        {plan.limitations.map((f) => (
          <li key={f} className="flex items-start gap-3 opacity-50">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg">
              <Minus className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
            </span>
            <span className="pt-0.5 text-[var(--color-text-secondary)]">{f}</span>
          </li>
        ))}
      </ul>

      {onSelect && (
        <Button
          type="button"
          onClick={onSelect}
          disabled={loading || current}
          variant={highlight ? 'default' : 'outline'}
          className={cn('mt-auto w-full', isJarvis && 'shadow-[0_8px_24px_rgba(var(--accent-primary-rgb),0.35)]')}
        >
          {current ? 'Plano atual' : actionLabel}
        </Button>
      )}
    </div>
  );
}
