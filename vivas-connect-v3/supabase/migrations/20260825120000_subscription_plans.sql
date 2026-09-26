-- ============================================================================
-- VIVAS · Planos de assinatura (Plano Bot / Plano Jarvis).
-- ============================================================================
-- Até aqui só existia um plano fixo (plan_price_cents). Agora a organização
-- escolhe entre "bot" (só disparo, limitado) e "jarvis" (sistema completo,
-- IA, Vivas Perfil, equipe ilimitada) na tela de pagamento — o preço real
-- cobrado continua em plan_price_cents (a Edge Function create-pix-charge
-- resolve o valor certo pelo `plan` escolhido antes de gerar o Pix).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT CHECK (plan IN ('bot', 'jarvis'));

COMMENT ON COLUMN whatsapp_hub.subscriptions.plan IS
  'Plano escolhido pela org. NULL até o primeiro pagamento ser gerado (create-pix-charge resolve e grava). Preços/recursos de cada plano: ver src/lib/plans.ts (frontend) e supabase/functions/_shared/plans.ts (Edge Functions) — nunca hardcodear em outro lugar.';
