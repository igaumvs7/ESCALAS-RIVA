-- Centraliza a lógica de "marcar bloqueio + calcular janela de recuperação"
-- num lugar só, chamado tanto pelo worker (detecção automática via 403)
-- quanto pela Edge Function do botão manual "Fui bloqueado" — evita duas
-- implementações divergentes da mesma regra.
SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.mark_webjs_blocked(p_org_id uuid, p_reason text)
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
  -- service_role (o worker) pode marcar qualquer org (nao tem JWT de
  -- usuario). Um usuario autenticado (botao manual) so pode marcar a
  -- PROPRIA org, e so se for admin - senao qualquer um bloquearia o canal
  -- de outra organizacao.
  IF auth.role() <> 'service_role' THEN
    IF p_org_id <> whatsapp_hub.current_org_id() OR whatsapp_hub.current_user_role() <> 'admin' THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  SELECT coalesce(block_count, 0) + 1 INTO v_block_count
  FROM whatsapp_hub.webjs_sessions WHERE org_id = p_org_id;

  -- Escalona a cautela: bloqueio repetido é sinal de chip deteriorando de
  -- verdade, não azar pontual.
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
      block_count = v_block_count,
      blocked_until = now() + interval '24 hours',
      recovery_until = now() + interval '24 hours' + (v_days || ' days')::interval,
      recovery_daily_limit = v_daily_limit
  WHERE org_id = p_org_id;
END;
$$;

-- SECURITY DEFINER pra permitir chamada tanto pelo service role (worker)
-- quanto por um admin autenticado (Edge Function do botão manual) — RLS de
-- webjs_sessions não dá update direto pro admin, só leitura.
GRANT EXECUTE ON FUNCTION whatsapp_hub.mark_webjs_blocked(uuid, text) TO authenticated, service_role;
