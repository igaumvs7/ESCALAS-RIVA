-- Automatiza "Tem interesse" / "Sem interesse" (antes eram botões manuais):
-- - Lead responde (qualquer mensagem inbound) → 'interessado' automático.
-- - Lead contatado há mais de 24h e NUNCA respondeu → 'sem_interesse'
--   automático (job periódico, mesma regra de 24h do relatório
--   "Não responderam" — não desclassifica quem já é qualificado/vendido).
-- 'qualificado' e 'venda_concluida' continuam manuais (pergunta na UI).
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

-- 1) Resposta do lead → interessado automático (promove de
--    nao_classificado OU sem_interesse; nunca rebaixa qualificado/vendido).
CREATE OR REPLACE FUNCTION whatsapp_hub._mark_lead_interested()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = whatsapp_hub, pg_temp
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE whatsapp_hub.conversations
    SET lead_interest = 'interessado'
    WHERE id = NEW.conversation_id
      AND lead_interest IN ('nao_classificado', 'sem_interesse');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_lead_interested ON whatsapp_hub.messages;
CREATE TRIGGER trg_mark_lead_interested
  AFTER INSERT ON whatsapp_hub.messages
  FOR EACH ROW
  EXECUTE FUNCTION whatsapp_hub._mark_lead_interested();

-- 2) Sem resposta após 24h → sem_interesse automático. Reaproveita a mesma
--    regra do RPC non_responders (nunca respondeu, não fechado, ainda não
--    classificado) — chamada por pg_cron periodicamente.
CREATE OR REPLACE FUNCTION whatsapp_hub._mark_stale_leads_no_interest()
RETURNS void
LANGUAGE plpgsql
SET search_path = whatsapp_hub, pg_temp
AS $$
BEGIN
  WITH last_out AS (
    SELECT DISTINCT ON (conversation_id) conversation_id, created_at
    FROM whatsapp_hub.messages
    WHERE direction = 'outbound' AND is_private_note = false
    ORDER BY conversation_id, created_at DESC
  ),
  ever_responded AS (
    SELECT DISTINCT conversation_id FROM whatsapp_hub.messages WHERE direction = 'inbound'
  )
  UPDATE whatsapp_hub.conversations c
  SET lead_interest = 'sem_interesse'
  FROM last_out lo
  WHERE c.id = lo.conversation_id
    AND c.status <> 'closed'
    AND c.lead_interest = 'nao_classificado'
    AND c.id NOT IN (SELECT conversation_id FROM ever_responded)
    AND lo.created_at <= now() - interval '24 hours';
END;
$$;

SELECT cron.schedule(
  'wh-mark-stale-leads',
  '0 * * * *',
  $$SELECT whatsapp_hub._mark_stale_leads_no_interest();$$
);
