import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { PlanId } from '@/lib/plans';

// ----------------------------------------------------------------------------
// useSubscription — status de cobranca da org atual (VIVAS billing).
// ----------------------------------------------------------------------------
// subscription === null significa "sem linha em subscriptions": a org e
// isenta do gate de billing (dono da plataforma, orgs criadas por convite
// direto). Só orgs nascidas via /auth/signup (self-serve) ganham a linha.
// ----------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'pending_first_payment'
  | 'active'
  | 'grace_period'
  | 'blocked'
  | 'canceled';

export interface SubscriptionRow {
  status: SubscriptionStatus;
  plan: PlanId | null;
  plan_price_cents: number;
  current_period_end: string | null;
  grace_period_end: string | null;
}

export function useSubscription() {
  const { orgId } = useAppUser();
  const [subscription, setSubscription] = useState<SubscriptionRow | null | undefined>(undefined);

  // Devolve a linha atualizada (não só atualiza o estado) — quem chama
  // consegue saber, sem esperar um novo render, se o status acabou de virar
  // 'active' (detecção de "pagamento acabou de cair", ver SubscriptionGate.tsx).
  const refresh = useCallback(async (): Promise<SubscriptionRow | null> => {
    if (!orgId) return null;
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('subscriptions')
      .select('status, plan, plan_price_cents, current_period_end, grace_period_end')
      .eq('org_id', orgId)
      .maybeSingle();
    const row = (data as SubscriptionRow | null) ?? null;
    setSubscription(row);
    return row;
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { subscription, loading: subscription === undefined, refresh };
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
