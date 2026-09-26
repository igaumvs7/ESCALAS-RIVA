-- Consolida mark_webjs_blocked numa função única e corrige o guard de
-- autorização. Três defeitos reais, TODOS confirmados empiricamente em
-- produção em 2026-09-11 (não são suposição — ver a prova de cada um).
--
-- 1) DUAS versões coexistiam: (uuid, text, text DEFAULT) oid 20772, criada
--    em 20260827140000 (block_kind), e (uuid, text) oid 21099, criada em
--    20260905120000 (rebalanceamento). Uma chamada PostgREST com 2 args
--    nomeados casa com as DUAS (a de 3 args tem DEFAULT no terceiro).
--    PROVA: POST /rest/v1/rpc/mark_webjs_blocked com {p_org_id, p_reason}
--    devolve PGRST203 "Could not choose the best candidate function".
--    Consequência: o botão "Fui bloqueado" (Edge Function
--    webjs-report-block, que chama com 2 args) está quebrado desde
--    2026-09-05 — o corretor clica e nada acontece.
--
-- 2) O worker (sessionManager.js::markBlocked) SEMPRE passa os 3 args,
--    porque `kind` tem default 'confirmed' no JavaScript e é enviado
--    explicitamente no rpc(). Logo o worker sempre resolvia pra versão de
--    3 args — a ANTIGA e punitiva (5/8/14 dias, 40/25/15 msgs/dia). O
--    rebalanceamento pedido pelo dono em 2026-09-05 ("a forma antiga eu
--    achava super exagerada") só existia na versão de 2 args, que nenhum
--    caller executava com sucesso. Na prática o rebalanceamento nunca
--    valeu pra nada.
--
-- 3) FALHA DE SEGURANÇA (não estava no estudo 07, descoberta ao testar):
--    o guard era `IF p_org_id <> current_org_id() OR current_user_role()
--    <> 'admin'`. Sem JWT (chamada anônima), as duas funções retornam
--    NULL; `x <> NULL` é NULL, `NULL OR NULL` é NULL, e `IF NULL THEN`
--    NÃO dispara — o RAISE EXCEPTION era simplesmente pulado.
--    PROVA: POST com a chave anon PÚBLICA (a que vai no bundle do
--    frontend) + os 3 args devolveu HTTP 204. Ou seja: qualquer pessoa
--    que soubesse o UUID de uma organização conseguia bloquear o WhatsApp
--    dela por 24h e ainda disparar a punição de recuperação.
--    Corrigido com IS DISTINCT FROM + coalesce, que nunca retornam NULL.
--
-- Depois desta migração fica UMA função só (3 args, terceiro com default),
-- servindo os dois callers sem ambiguidade: o worker (3 args) e a Edge
-- Function do botão manual (2 args, usa o default).

SET search_path TO whatsapp_hub, public;

DROP FUNCTION IF EXISTS whatsapp_hub.mark_webjs_blocked(uuid, text);

CREATE OR REPLACE FUNCTION whatsapp_hub.mark_webjs_blocked(
  p_org_id uuid,
  p_reason text,
  p_block_kind text DEFAULT 'confirmed'
)
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
  -- coalesce + IS DISTINCT FROM: sem JWT, auth.role()/current_org_id()/
  -- current_user_role() retornam NULL, e a versão antiga (com <> puro)
  -- deixava o guard inteiro virar NULL, que não dispara o IF. Ver defeito
  -- (3) no cabeçalho.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF p_org_id IS DISTINCT FROM whatsapp_hub.current_org_id()
       OR coalesce(whatsapp_hub.current_user_role()::text, '') <> 'admin' THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  SELECT coalesce(block_count, 0), recovery_until
    INTO v_prev_count, v_prev_recovery_until
  FROM whatsapp_hub.webjs_sessions WHERE org_id = p_org_id;

  -- Decaimento: se a última recuperação terminou há 21+ dias, trata como
  -- reincidência zerada em vez de escalar pra sempre por bloqueio antigo.
  IF v_prev_recovery_until IS NOT NULL AND v_prev_recovery_until < now() - interval '21 days' THEN
    v_prev_count := 0;
  END IF;

  v_block_count := coalesce(v_prev_count, 0) + 1;

  -- Tiers rebalanceados (pedido do dono, 2026-09-05) — só agora passam a
  -- valer de verdade, ver defeito (2) no cabeçalho.
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
      block_kind = p_block_kind,
      block_count = v_block_count,
      blocked_until = now() + interval '24 hours',
      recovery_until = now() + interval '24 hours' + (v_days || ' days')::interval,
      recovery_daily_limit = v_daily_limit
  WHERE org_id = p_org_id;
END;
$$;
