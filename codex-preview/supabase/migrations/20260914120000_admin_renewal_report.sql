-- ============================================================================
-- VIVAS · Relatório de renovação no painel do dono (/admin)
-- ----------------------------------------------------------------------------
-- Pedido do dono (2026-09-14): "quero ver quem assinou uma vez e nunca mais
-- renovou, quem renovava sempre e parou" — pra poder entrar em contato e
-- tentar trazer o cliente de volta. Antes só existia a taxa agregada
-- (renewal_rate_pct em platform_admin_metrics); isso é o detalhe por cliente
-- por trás daquele número.
--
-- Uma organização = um cliente (corretor) nesse modelo de cadastro self-serve.
-- payments_count/first_paid_at/last_paid_at vêm só de pagamentos 'approved'
-- em subscription_payments (mesmo status literal usado em platform_admin_
-- metrics, vindo direto da API do Mercado Pago). A classificação em si
-- (nunca pagou / pagou 1x e não renovou / renovava e parou / ativo / em
-- atraso) fica pro frontend montar a partir desses campos crus — mais fácil
-- de ajustar a régua sem migration nova.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.platform_renewal_report()
RETURNS TABLE (
  org_id              UUID,
  org_name            TEXT,
  whatsapp_contact    TEXT,
  plan                TEXT,
  status              TEXT,
  signed_up_at        TIMESTAMPTZ,
  payments_count      INT,
  first_paid_at       TIMESTAMPTZ,
  last_paid_at        TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, public, pg_temp
AS $$
BEGIN
  IF NOT whatsapp_hub.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o super admin acessa esse relatório.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.whatsapp_contact,
    s.plan,
    s.status,
    o.created_at,
    COALESCE(p.cnt, 0)::int,
    p.first_paid_at,
    p.last_paid_at,
    s.current_period_end
  FROM whatsapp_hub.organizations o
  JOIN whatsapp_hub.subscriptions s ON s.org_id = o.id
  LEFT JOIN (
    SELECT
      sp.org_id,
      count(*) AS cnt,
      min(sp.paid_at) AS first_paid_at,
      max(sp.paid_at) AS last_paid_at
    FROM whatsapp_hub.subscription_payments sp
    WHERE sp.status = 'approved'
    GROUP BY sp.org_id
  ) p ON p.org_id = o.id
  ORDER BY p.last_paid_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.platform_renewal_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.platform_renewal_report() TO authenticated;
