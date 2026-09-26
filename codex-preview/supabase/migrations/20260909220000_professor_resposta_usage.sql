-- Professor Resposta: limite de 20 usos/dia por organização (pedido do dono,
-- 2026-09-09). Contador simples por org+dia, incrementado atomicamente pela
-- Edge Function (service_role) — nunca exposto direto pra authenticated,
-- mesmo padrão de mark_webjs_blocked (checagem explícita de quem chama, não
-- confia em current_org_id() porque Edge Functions rodam com service_role e
-- não carregam claims de usuário).

CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE TABLE IF NOT EXISTS whatsapp_hub.professor_resposta_usage (
  org_id     uuid NOT NULL REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, usage_date)
);

ALTER TABLE whatsapp_hub.professor_resposta_usage ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito (mesmo padrão de public.app_settings) — só
-- service_role acessa, via as duas funções abaixo.

CREATE OR REPLACE FUNCTION whatsapp_hub.consume_professor_resposta_usage(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO whatsapp_hub.professor_resposta_usage (org_id, usage_date, count)
  VALUES (p_org_id, CURRENT_DATE, 1)
  ON CONFLICT (org_id, usage_date)
  DO UPDATE SET count = whatsapp_hub.professor_resposta_usage.count + 1
  WHERE whatsapp_hub.professor_resposta_usage.count < 20
  RETURNING count INTO v_count;

  RETURN v_count; -- NULL = limite de hoje já atingido
END;
$$;

CREATE OR REPLACE FUNCTION whatsapp_hub.get_professor_resposta_usage(p_org_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
  SELECT COALESCE(count, 0) FROM whatsapp_hub.professor_resposta_usage
  WHERE org_id = p_org_id AND usage_date = CURRENT_DATE;
$$;

REVOKE ALL ON FUNCTION whatsapp_hub.consume_professor_resposta_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION whatsapp_hub.get_professor_resposta_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION whatsapp_hub.consume_professor_resposta_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION whatsapp_hub.get_professor_resposta_usage(uuid) TO service_role;
