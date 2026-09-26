import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

interface RobotLoaderProps {
  /** Tamanho do robô em px. Default 56 (tela cheia). */
  size?: number;
  label?: string;
}

// Loading "de marca" — só pra momentos que realmente bloqueiam a tela
// inteira (troca de página, gate de sessão/assinatura). Não usar em spinner
// pequeno de botão/lista — ali o spinner genérico continua certo, isso
// aqui é pra quando o usuário está parado esperando o sistema.
export function RobotLoader({ size = 56, label = 'Carregando...' }: RobotLoaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(glowRef.current, { autoAlpha: 0.5, scale: 1 });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });
        tl.to(robotRef.current, { y: -8, rotation: -4, duration: 0.55 }, 0)
          .to(robotRef.current, { y: 0, rotation: 4, duration: 0.55 }, 0.55)
          .to(robotRef.current, { y: -8, rotation: 0, duration: 0.55 }, 1.1)
          .to(glowRef.current, { autoAlpha: 0.85, scale: 1.35, duration: 0.9 }, 0)
          .to(glowRef.current, { autoAlpha: 0.35, scale: 0.9, duration: 0.75 }, 0.9);

        return () => tl.kill();
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="flex flex-col items-center justify-center gap-3">
      <div className="relative flex items-center justify-center" style={{ width: size * 1.8, height: size * 1.8 }}>
        <div
          ref={glowRef}
          className="absolute rounded-full opacity-40"
          style={{
            width: size * 1.6,
            height: size * 1.6,
            background: 'radial-gradient(circle, rgba(var(--accent-secondary-rgb),0.55), transparent 70%)',
          }}
          aria-hidden="true"
        />
        <img
          ref={robotRef}
          src="/logo-mark.png"
          alt=""
          aria-hidden="true"
          className="relative object-contain drop-shadow-[0_0_16px_rgba(var(--accent-secondary-rgb),0.4)]"
          style={{ width: size, height: size }}
        />
      </div>
      {label && <div className="text-label opacity-60">{label}</div>}
    </div>
  );
}
