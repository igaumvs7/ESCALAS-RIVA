-- Bug real (2026-09-10, pedido do dono): o limite diário do Professor
-- Resposta resetava usando CURRENT_DATE, que no banco roda em UTC. Como
-- Brasília é UTC-3, isso fazia o "dia" virar 3h ANTES da meia-noite local
-- (às 21h de Brasília), não exatamente à meia-noite como o dono espera.
-- Corrige as duas funções pra calcular a data sempre em America/Sao_Paulo.
-- Aplicada direto via MCP (apply_migration) em 2026-09-11, replicada aqui
-- pro histórico do repositório ficar completo.

SET search_path TO whatsapp_hub;

CREATE OR REPLACE FUNCTION whatsapp_hub.consume_professor_resposta_usage(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_count integer;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO whatsapp_hub.professor_resposta_usage (org_id, usage_date, count)
  VALUES (p_org_id, v_today, 1)
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
  WHERE org_id = p_org_id AND usage_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- Alinha o default da coluna também, por consistência (a função já passa a
-- data explícita, então isso só evita divergência se algo inserir sem
-- passar usage_date no futuro).
ALTER TABLE whatsapp_hub.professor_resposta_usage
  ALTER COLUMN usage_date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);
