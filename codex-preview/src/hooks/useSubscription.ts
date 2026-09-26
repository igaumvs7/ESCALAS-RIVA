import type { PlanId } from '@/lib/plans';

// PREVIEW MOCK — returns null subscription (org exempt from billing gate).

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
  return { subscription: null as SubscriptionRow | null, loading: false, refresh: async (): Promise<SubscriptionRow | null> => null };
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}
