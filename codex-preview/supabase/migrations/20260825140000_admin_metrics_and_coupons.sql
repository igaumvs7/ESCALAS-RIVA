-- ============================================================================
-- VIVAS · Painel do dono: métricas (VGV, usuários por plano, renovação,
-- ativos ao mesmo tempo) + sistema de cupons de desconto.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

-- WhatsApp de contato de quem se cadastra (organização = cliente da
-- plataforma) — vira a "lista de contatos dos clientes" no painel do dono.
ALTER TABLE whatsapp_hub.organizations
  ADD COLUMN IF NOT EXISTS whatsapp_contact TEXT;

-- ----------------------------------------------------------------------------
-- Cupons de desconto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_hub.coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INT NOT NULL CHECK (discount_value > 0), -- percent: 1-100; fixed: centavos
  active         BOOLEAN NOT NULL DEFAULT true,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_hub.subscription_payments
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES whatsapp_hub.coupons(id);

ALTER TABLE whatsapp_hub.coupons ENABLE ROW LEVEL SECURITY;
-- Só super admin gerencia cupons (mesmo padrão de organizations) — sem
-- policy nenhuma pra authenticated normal: só service_role (Edge/API do
-- painel do dono) e super admin via RLS explícita.
DROP POLICY IF EXISTS coupons_super_admin ON whatsapp_hub.coupons;
CREATE POLICY coupons_super_admin ON whatsapp_hub.coupons
  FOR ALL TO authenticated
  USING (whatsapp_hub.is_super_admin())
  WITH CHECK (whatsapp_hub.is_super_admin());

COMMENT ON TABLE whatsapp_hub.coupons IS
  'Cupons de desconto pro Pix da assinatura. discount_value: percent = 1-100 (%), fixed = centavos de desconto direto. Validado/aplicado em create-pix-charge.';

-- ----------------------------------------------------------------------------
-- Snapshot de atividade — base pra "média de usuários ativos ao mesmo tempo".
-- Sem histórico anterior a esta migração: o painel mostra a média calculada
-- a partir de agora em diante (acumula com o tempo).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_hub.platform_activity_snapshots (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  online_count  INT NOT NULL
);

CREATE OR REPLACE FUNCTION whatsapp_hub.capture_activity_snapshot()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = whatsapp_hub, public, pg_temp
AS $$
  INSERT INTO whatsapp_hub.platform_activity_snapshots (online_count)
  SELECT count(*) FROM whatsapp_hub.app_users WHERE is_online = true;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.capture_activity_snapshot() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.capture_activity_snapshot() TO service_role;

SELECT cron.schedule(
  'platform-activity-snapshot',
  '0 * * * *', -- de hora em hora
  $$SELECT whatsapp_hub.capture_activity_snapshot();$$
);

-- ----------------------------------------------------------------------------
-- Métricas agregadas do painel do dono. SECURITY DEFINER + checagem explícita
-- de super admin (mesmo padrão de outras RPCs sensíveis) — nunca confia em
-- RLS de tabela sozinha pra isso, já que agrega dado de TODAS as orgs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION whatsapp_hub.platform_admin_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, public, pg_temp
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT whatsapp_hub.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o super admin acessa essas métricas.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT json_build_object(
    'orgs_total', (SELECT count(*) FROM whatsapp_hub.organizations),
    'orgs_active', (SELECT count(*) FROM whatsapp_hub.organizations WHERE status = 'active'),
    'users_by_plan', (
      SELECT json_build_object(
        'bot', count(*) FILTER (WHERE plan = 'bot'),
        'jarvis', count(*) FILTER (WHERE plan = 'jarvis'),
        'sem_plano', count(*) FILTER (WHERE plan IS NULL)
      )
      FROM whatsapp_hub.subscriptions
    ),
    -- VGV: soma de todo pagamento aprovado desde sempre. 'approved' é o
    -- status literal que a API do Mercado Pago devolve (gravado como veio,
    -- sem tradução) — ver mercadopago-webhook.
    'vgv_cents', (
      SELECT COALESCE(sum(amount_cents), 0)
      FROM whatsapp_hub.subscription_payments
      WHERE status = 'approved'
    ),
    -- MRR: soma do preço travado de quem está pagando em dia agora.
    'mrr_cents', (
      SELECT COALESCE(sum(plan_price_cents), 0)
      FROM whatsapp_hub.subscriptions
      WHERE status IN ('active', 'grace_period')
    ),
    -- Renovação: de quem já passou pelo menos 1 ciclo completo (teve
    -- current_period_end no passado), qual % ainda está ativo/em carência
    -- (renovou) vs bloqueado/cancelado (não renovou).
    'renewal_rate_pct', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
        ELSE round(100.0 * count(*) FILTER (WHERE status IN ('active', 'grace_period')) / count(*))
      END
      FROM whatsapp_hub.subscriptions
      WHERE current_period_end IS NOT NULL AND current_period_end < now()
    ),
    'online_now', (SELECT count(*) FROM whatsapp_hub.app_users WHERE is_online = true),
    'avg_concurrent_users', (
      SELECT round(avg(online_count), 1) FROM whatsapp_hub.platform_activity_snapshots
    ),
    'activity_tracking_since', (
      SELECT min(captured_at) FROM whatsapp_hub.platform_activity_snapshots
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.platform_admin_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.platform_admin_metrics() TO authenticated;
