import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// PulseRadar — efeito "radar" (dois anéis expandindo e sumindo, defasados)
// atrás de um ícone central. Era @keyframes CSS (auth-pulse-ring); migrado
// pro GSAP (skill gsap-core) pra ficar junto do resto das animações do app.
export function PulseRadar({
  children,
  size = 80,
  color = 'var(--accent-gold)',
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  const ring1 = useRef<HTMLDivElement>(null);
  const ring2 = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const vars = {
        scale: 1.8,
        autoAlpha: 0,
        duration: 2.2,
        ease: 'power2.out',
        repeat: -1,
      };
      const t1 = gsap.fromTo(ring1.current, { scale: 0.8, autoAlpha: 0.7 }, vars);
      const t2 = gsap.fromTo(ring2.current, { scale: 0.8, autoAlpha: 0.7 }, { ...vars, delay: 0.9 });
      return () => {
        t1.kill();
        t2.kill();
      };
    });
    return () => mm.revert();
  });

  return (
    <div className="relative flex items-center justify-center" style={{ height: size, width: size }}>
      <div ref={ring1} className="absolute inset-0 rounded-full" style={{ backgroundColor: color, opacity: 0.2 }} />
      <div ref={ring2} className="absolute inset-0 rounded-full" style={{ backgroundColor: color, opacity: 0.2 }} />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(232,185,74,0.12)' }}>
        {children}
      </div>
    </div>
  );
}
