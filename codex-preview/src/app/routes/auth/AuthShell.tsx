import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Lock, ShieldCheck } from 'lucide-react';
import { InteractiveBackground } from '@/components/auth/InteractiveBackground';

gsap.registerPlugin(useGSAP);

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Shared chrome for /auth/login e /auth/signup.
//
// Animações via GSAP (skill oficial greensock/gsap-skills, 2026-08-24 —
// antes era tudo CSS puro: @keyframes + transition). Um timeline só cuida
// da entrada (logo → card), um tween contínuo cuida da inclinação 3D da
// logo, e gsap.quickTo() cuida do parallax da grade seguindo o cursor —
// quickTo é a recomendação oficial pra valor que atualiza a cada
// mousemove (reaproveita o mesmo tween em vez de criar um novo por evento).
// gsap.matchMedia() desliga tudo isso pra quem prefere menos movimento.
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Entrada: logo aparece, card vem logo em seguida.
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from(logoRef.current, { autoAlpha: 0, y: -12, duration: 0.5 })
          .from(cardRef.current, { autoAlpha: 0, y: 16, duration: 0.6 }, '<0.1');

        // Inclinação 3D contínua e sutil da logo (era @keyframes CSS).
        const tiltTween = gsap.to(logoRef.current, {
          rotationY: 6,
          rotationX: -3,
          transformPerspective: 600,
          duration: 3.5,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });

        return () => tiltTween.kill();
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="relative min-h-screen flex flex-col overflow-hidden">
      {/* Fundo interativo por tema (canvas — grade que se deforma, ondas,
          aurora ou raios de sol, dependendo do tema ativo). Ver
          components/auth/InteractiveBackground.tsx. */}
      <InteractiveBackground />

      <div className="relative flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div ref={logoRef} className="flex flex-col items-center justify-center gap-2 mb-8">
            <img
              src="/logo-full-dark.png"
              alt="VIVAS CONNECT"
              className="h-20 w-auto object-contain drop-shadow-[0_0_30px_rgba(var(--accent-primary-rgb),0.35)]"
            />
            <div className="text-label !text-sm">Sua operação em um só lugar</div>
          </div>

          <div ref={cardRef} className="auth-card-premium glass-card p-8 space-y-6">
            <header className="space-y-1">
              <h1 className="text-2xl font-bold text-display">{title}</h1>
              {subtitle && (
                <p className="text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
              )}
            </header>

            {children}
          </div>

          {footer && (
            <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
              {footer}
            </p>
          )}
        </div>
      </div>

      <footer className="relative border-t border-[rgba(var(--accent-secondary-rgb),0.08)] px-4 py-6 text-center text-xs text-[var(--color-text-secondary)] space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 opacity-80">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Conexão criptografada (TLS)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Dados protegidos, conforme a LGPD
          </span>
        </div>
        <p>
          VIVAS CONNECT — site, CRM e WhatsApp em um só lugar para o seu negócio.
        </p>
        <p>© {new Date().getFullYear()} Vivas Connect</p>
      </footer>
    </div>
  );
}
