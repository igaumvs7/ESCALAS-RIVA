// Espelho server-side de src/lib/plans.ts — Edge Functions (Deno) não podem
// importar de src/, então o preço/id de cada plano precisa existir aqui
// também. Mudar um SEM o outro deixa o preço mostrado na UI divergente do
// preço realmente cobrado no Pix — sempre atualizar os dois juntos.

export type PlanId = 'bot' | 'jarvis';

export const LAUNCH_PRICING_ACTIVE = true;

export const PLAN_PRICES_CENTS: Record<PlanId, { regular: number; launch: number }> = {
  bot: { regular: 4790, launch: 2990 },
  jarvis: { regular: 12790, launch: 6990 },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === 'bot' || value === 'jarvis';
}

export function priceCentsForPlan(plan: PlanId): number {
  const entry = PLAN_PRICES_CENTS[plan];
  return LAUNCH_PRICING_ACTIVE ? entry.launch : entry.regular;
}
