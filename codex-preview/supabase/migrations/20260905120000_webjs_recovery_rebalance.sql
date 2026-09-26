-- Refaz a estratégia de recuperação de confiança do chip pós-bloqueio.
-- Pedido do dono (2026-09-05): "a forma antiga eu achava ela super
-- exagerada, pois eu já fiz os envios várias vezes e já fui bloqueado
-- DIVERSAS vezes e sempre que sou desbloqueado continuo fazendo o envio
-- para muitas pessoas então esse cálculo e essa estratégia tem que ser
-- refeita e eu quero que ela apareça para o cliente".
--
-- Dois problemas na versão anterior (20260823120100_mark_webjs_blocked_rpc):
--   1) Os números eram exagerados pra realidade observada (40/25/15 msgs/dia
--      por 5/8/14 dias — na prática, o número volta a enviar pra muita gente
--      sem problema depois de desbloqueado).
--   2) `block_count` só crescia, nunca decaía — um número com histórico de
--      bloqueios ANTIGOS (meses atrás) ficava preso pra sempre no tier mais
--      punitivo (14 dias / 15 msgs), mesmo se comportando bem há muito tempo.
--      Isso sozinho já explica boa parte do "exagerado" reportado.
--
-- Fix: (a) tiers bem mais permissivos; (b) decaimento — se a última
-- recuperação terminou há 21+ dias, conta como reincidência "zerada" (volta
-- pro tier 1) em vez de continuar escalando pra sempre.
SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.mark_webjs_blocked(p_org_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_prev_count int;
  v_prev_recovery_until timestamptz;
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

  SELECT coalesce(block_count, 0), recovery_until
    INTO v_prev_count, v_prev_recovery_until
  FROM whatsapp_hub.webjs_sessions WHERE org_id = p_org_id;

  -- Decaimento: última recuperação terminou há 21+ dias → trata como
  -- reincidência zerada, não continua escalando pra sempre.
  IF v_prev_recovery_until IS NOT NULL AND v_prev_recovery_until < now() - interval '21 days' THEN
    v_prev_count := 0;
  END IF;

  v_block_count := v_prev_count + 1;

  -- Tiers recalculados (2026-09-05) — bem menos punitivos que os anteriores
  -- (eram 5/8/14 dias, 40/25/15 msgs/dia). Só escalona de verdade pra
  -- reincidência RÁPIDA (novo bloqueio antes do decaimento de 21 dias acima).
  IF v_block_count <= 1 THEN
    v_days := 2; v_daily_limit := 120;
  ELSIF v_block_count = 2 THEN
    v_days := 3; v_daily_limit := 80;
  ELSE
    v_days := 5; v_daily_limit := 50;
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
