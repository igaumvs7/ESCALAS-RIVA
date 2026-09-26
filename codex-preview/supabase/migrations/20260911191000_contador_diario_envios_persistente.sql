-- BUG REAL (2026-09-11): o limite diario de envio vivia so em memoria
-- (campaignWorker.js, Map orgState.sentToday). Qualquer reinicio do worker
-- (deploy, queda, pm2 restart) zerava o contador e a organizacao ganhava o
-- limite diario INTEIRO de novo no mesmo dia -- o oposto do que o motor
-- anti-bloqueio existe pra fazer.
--
-- Data sempre em America/Sao_Paulo (mesmo padrao de professor_resposta_usage):
-- CURRENT_DATE rodaria em UTC e viraria o dia as 21h de Brasilia.
CREATE TABLE IF NOT EXISTS whatsapp_hub.campaign_daily_sends (
  org_id uuid NOT NULL REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  send_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, send_date)
);
ALTER TABLE whatsapp_hub.campaign_daily_sends ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION whatsapp_hub.bump_campaign_daily_send(p_org_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp AS $$
DECLARE
  v_count integer;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO whatsapp_hub.campaign_daily_sends (org_id, send_date, count, updated_at)
  VALUES (p_org_id, v_today, 1, now())
  ON CONFLICT (org_id, send_date)
  DO UPDATE SET count = whatsapp_hub.campaign_daily_sends.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END; $$;

-- COALESCE por FORA do subselect: `SELECT COALESCE(count,0) FROM t WHERE ...`
-- devolve NULL quando NENHUMA linha casa (o COALESCE so age sobre o valor de
-- uma linha existente, nao sobre "zero linhas"). Bug encontrado ao testar --
-- no primeiro envio do dia ainda nao existe linha.
CREATE OR REPLACE FUNCTION whatsapp_hub.get_campaign_daily_sends(p_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp AS $$
  SELECT COALESCE((SELECT count FROM whatsapp_hub.campaign_daily_sends
                    WHERE org_id = p_org_id
                      AND send_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0);
$$;

-- Mesmo bug do NULL na funcao ja existente do Professor Resposta.
CREATE OR REPLACE FUNCTION whatsapp_hub.get_professor_resposta_usage(p_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp AS $$
  SELECT COALESCE((SELECT count FROM whatsapp_hub.professor_resposta_usage
                    WHERE org_id = p_org_id
                      AND usage_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date), 0);
$$;

-- Licao de 2026-09-11: funcao SECURITY DEFINER que recebe org_id NUNCA fica
-- aberta pra authenticated/anon. So o worker (service_role) chama estas.
REVOKE EXECUTE ON FUNCTION whatsapp_hub.bump_campaign_daily_send(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION whatsapp_hub.get_campaign_daily_sends(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION whatsapp_hub.get_professor_resposta_usage(uuid) FROM authenticated, anon, PUBLIC;
