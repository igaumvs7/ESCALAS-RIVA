import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// ----------------------------------------------------------------------------
// StatusPulse — bolinha de status "vivo" (pisca de leve). Migrado de
// animate-ping do Tailwind pro GSAP (skill gsap-core), pra ficar junto do
// resto das animações do app. Pedido do dono: "elementos de informação com
// cores tipo 'ativo' ... piscando de leve". Usar com moderação — só em
// estados que realmente mudam em tempo real (conexão, presença), não como
// decoração genérica.
// ----------------------------------------------------------------------------

const TONE_COLOR: Record<'success' | 'warning' | 'error' | 'neutral', string> = {
  success: 'var(--color-success)',
  warning: '#FBBF24',
  error: 'var(--color-error)',
  neutral: 'var(--color-text-secondary)',
};

interface StatusPulseProps {
  tone?: 'success' | 'warning' | 'error' | 'neutral';
  label?: string;
  className?: string;
}

export function StatusPulse({ tone = 'success', label, className }: StatusPulseProps) {
  const color = TONE_COLOR[tone];
  const ringRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tween = gsap.fromTo(
        ringRef.current,
        { scale: 1, autoAlpha: 0.75 },
        { scale: 2.2, autoAlpha: 0, duration: 1.4, ease: 'power1.out', repeat: -1 },
      );
      return () => tween.kill();
    });
    return () => mm.revert();
  });

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span ref={ringRef} className="absolute inline-flex h-full w-full rounded-full" style={{ backgroundColor: color }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      </span>
      {label && (
        <span className="text-xs font-semibold" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}
