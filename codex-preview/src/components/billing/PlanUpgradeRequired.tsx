import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

// Tela mostrada NO LUGAR da página bloqueada (não redireciona mais em
// silêncio) quando o plano atual não inclui o recurso — pedido do dono:
// "Seu plano atual não suporta essa funcionalidade" + opção de trocar.
export function PlanUpgradeRequired({ feature }: { feature?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="glass-card max-w-sm w-full p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(var(--accent-primary-rgb),0.12)]">
          <Lock className="h-6 w-6 text-[var(--accent-primary)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-display">
            Seu plano atual não suporta essa funcionalidade
          </h1>
          {feature && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {feature} é exclusivo do Plano Jarvis.
            </p>
          )}
        </div>
        <Link to="/planos" className={buttonVariants({ className: 'w-full' })}>
          Trocar de plano
        </Link>
      </div>
    </div>
  );
}
