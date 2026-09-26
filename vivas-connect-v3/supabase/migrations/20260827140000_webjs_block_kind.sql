-- Distingue bloqueio CONFIRMADO (código 403 real, ou o botão manual "Fui
-- bloqueado") de bloqueio por RISCO (score da baileys-antiban subiu pra
-- high/critical em campaignWorker.js::checkAntibanRisk — um indício, não uma
-- confirmação do WhatsApp) — pedido do dono (2026-08-27): quando for só
-- indício de risco, a tela deve avisar de forma diferente de "confirmado",
-- explicando que foi por precaução.
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.webjs_sessions
  ADD COLUMN IF NOT EXISTS block_kind TEXT CHECK (block_kind IN ('confirmed', 'risk'));

DROP FUNCTION IF EXISTS whatsapp_hub.mark_webjs_blocked(uuid, text);

CREATE FUNCTION whatsapp_hub.mark_webjs_blocked(p_org_id uuid, p_reason text, p_block_kind text DEFAULT 'confirmed')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_block_count int;
  v_days int;
  v_daily_limit int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF p_org_id <> whatsapp_hub.current_org_id() OR whatsapp_hub.current_user_role() <> 'admin' THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  SELECT coalesce(block_count, 0) + 1 INTO v_block_count
  FROM whatsapp_hub.webjs_sessions WHERE org_id = p_org_id;

  IF v_block_count <= 1 THEN
    v_days := 5; v_daily_limit := 40;
  ELSIF v_block_count = 2 THEN
    v_days := 8; v_daily_limit := 25;
  ELSE
    v_days := 14; v_daily_limit := 15;
  END IF;

  UPDATE whatsapp_hub.webjs_sessions
  SET status = 'blocked',
      qr_data_url = null,
      last_error = p_reason,
      block_kind = p_block_kind,
      block_count = v_block_count,
      blocked_until = now() + interval '24 hours',
      recovery_until = now() + interval '24 hours' + (v_days || ' days')::interval,
      recovery_daily_limit = v_daily_limit
  WHERE org_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION whatsapp_hub.mark_webjs_blocked(uuid, text, text) TO authenticated, service_role;
