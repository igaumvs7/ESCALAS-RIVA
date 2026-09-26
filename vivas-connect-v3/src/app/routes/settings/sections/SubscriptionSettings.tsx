import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSubscription, daysUntil } from '@/hooks/useSubscription';
import { getPlan, formatBRL } from '@/lib/plans';

const STATUS_LABEL: Record<string, string> = {
  pending_first_payment: 'Aguardando primeiro pagamento',
  active: 'Ativa',
  grace_period: 'Em atraso (carência)',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
};

// Configurações > Assinatura — ver o plano atual; trocar de plano acontece
// na página própria /planos (2026-08-31, pedido do dono: "quero uma página
// só disso, com a setinha de voltar" — antes ficava embutido aqui dentro
// de um Card, espremido; agora só existe UM lugar com esse fluxo).
export function SubscriptionSettings() {
  const navigate = useNavigate();
  const { subscription, loading } = useSubscription();

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-text-secondary)]">Carregando assinatura...</p>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <div className="space-y-2">
          <h2 className="text-lg font-bold">Assinatura</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Esta organização não tem cobrança configurada — acesso liberado sem plano.
          </p>
        </div>
      </Card>
    );
  }

  const currentPlanDef = subscription.plan ? getPlan(subscription.plan) : null;
  const renewal = daysUntil(subscription.current_period_end);

  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">Assinatura</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Status: <span className="text-[var(--color-text-primary)]">{STATUS_LABEL[subscription.status] ?? subscription.status}</span>
            </p>
          </header>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.2)] p-4">
            <div>
              <div className="text-sm text-[var(--color-text-secondary)]">Plano atual</div>
              <div className="text-xl font-bold text-display">{currentPlanDef?.name ?? '—'}</div>
              <div className="text-sm text-[var(--color-text-secondary)]">
                {formatBRL(subscription.plan_price_cents)}/mês
                {renewal != null && renewal >= 0 && ` · renova em ${renewal} dia(s)`}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => navigate('/planos')}>
              Trocar de plano
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
