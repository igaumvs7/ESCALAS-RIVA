-- ============================================================================
-- VIVAS · Métricas do painel do dono ganham filtro de período (igual ao
-- Dashboard de leads) — VGV e nº de vendas passam a valer só pro intervalo
-- escolhido; o resto (orgs ativas, usuários por plano, MRR, online agora)
-- continua sendo o estado ATUAL (não faz sentido "MRR de 30 dias atrás").
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.platform_admin_metrics(
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to   TIMESTAMPTZ DEFAULT NULL
)
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
    'new_orgs_in_period', (
      SELECT count(*) FROM whatsapp_hub.organizations
      WHERE (p_from IS NULL OR created_at >= p_from)
        AND (p_to IS NULL OR created_at <= p_to)
    ),
    'users_by_plan', (
      SELECT json_build_object(
        'bot', count(*) FILTER (WHERE plan = 'bot'),
        'jarvis', count(*) FILTER (WHERE plan = 'jarvis'),
        'sem_plano', count(*) FILTER (WHERE plan IS NULL)
      )
      FROM whatsapp_hub.subscriptions
    ),
    -- VGV = Valor Geral de Vendas: soma de TODO pagamento aprovado dentro do
    -- período escolhido (sem período = desde sempre). 'approved' é o status
    -- literal que a API do Mercado Pago devolve — ver mercadopago-webhook.
    'vgv_cents', (
      SELECT COALESCE(sum(amount_cents), 0)
      FROM whatsapp_hub.subscription_payments
      WHERE status = 'approved'
        AND (p_from IS NULL OR paid_at >= p_from)
        AND (p_to IS NULL OR paid_at <= p_to)
    ),
    'sales_count', (
      SELECT count(*)
      FROM whatsapp_hub.subscription_payments
      WHERE status = 'approved'
        AND (p_from IS NULL OR paid_at >= p_from)
        AND (p_to IS NULL OR paid_at <= p_to)
    ),
    'mrr_cents', (
      SELECT COALESCE(sum(plan_price_cents), 0)
      FROM whatsapp_hub.subscriptions
      WHERE status IN ('active', 'grace_period')
    ),
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

REVOKE EXECUTE ON FUNCTION whatsapp_hub.platform_admin_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.platform_admin_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
