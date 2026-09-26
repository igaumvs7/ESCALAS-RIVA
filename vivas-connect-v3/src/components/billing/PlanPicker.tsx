import { useRef } from 'react';
import { Sparkles } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { PLANS, LAUNCH_PRICING_ACTIVE, type PlanId } from '@/lib/plans';
import { PlanCard } from './PlanCard';

gsap.registerPlugin(useGSAP);

interface PlanPickerProps {
  currentPlan?: PlanId | null;
  onSelect: (plan: PlanId) => void;
  loading?: boolean;
}

// Seletor de plano compartilhado — usado na tela de pagamento pós-cadastro
// (SubscriptionGate) e em Configurações > Assinatura (trocar de plano).
export function PlanPicker({ currentPlan, onSelect, loading }: PlanPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Entrada em stagger (cards sobem + aparecem em sequência) — sem isso os
  // cards só "apareciam" instantaneamente, reforçando a sensação amadora
  // que o dono reportou. gsap.matchMedia cobre reduced-motion.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.plan-card-slot', {
          autoAlpha: 0,
          y: 28,
          scale: 0.97,
          duration: 0.55,
          stagger: 0.12,
          ease: 'power3.out',
        });
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [] },
  );

  return (
    <div ref={rootRef} className="space-y-5">
      {LAUNCH_PRICING_ACTIVE && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--accent-primary)]/30 bg-[rgba(var(--accent-primary-rgb),0.08)] px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
          <p className="text-sm text-[var(--color-text-primary)]">
            <strong>Preço de lançamento</strong> — valor promocional por tempo
            limitado. Quem assina agora mantém esse preço.
          </p>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="plan-card-slot h-full">
            <PlanCard
              plan={plan}
              highlight={plan.id === 'jarvis'}
              current={currentPlan === plan.id}
              loading={loading}
              onSelect={() => onSelect(plan.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
