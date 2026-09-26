-- RPC do relatório manual de "não responderam" — substitui o follow-up
-- automático (que dependia do Zernio/UAZAPI, descontinuado). Regra de 24h:
-- só entra na lista quem foi contatado há mais de p_hours (padrão 24) e
-- nunca respondeu, evitando reenvio cedo demais (risco de banimento).
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE OR REPLACE FUNCTION whatsapp_hub.non_responders(p_hours int DEFAULT 24)
RETURNS TABLE (
  conversation_id uuid,
  contact_id uuid,
  contact_name text,
  contact_phone text,
  last_outbound_at timestamptz,
  hours_since numeric
)
LANGUAGE sql
STABLE
SET search_path = whatsapp_hub, pg_temp
AS $$
  WITH last_out AS (
    SELECT DISTINCT ON (conversation_id) conversation_id, created_at
    FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id()
      AND direction = 'outbound' AND is_private_note = false
    ORDER BY conversation_id, created_at DESC
  ),
  ever_responded AS (
    SELECT DISTINCT conversation_id
    FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id() AND direction = 'inbound'
  )
  SELECT
    c.id,
    ct.id,
    ct.name,
    ct.phone,
    lo.created_at,
    round(extract(epoch FROM (now() - lo.created_at)) / 3600, 1)
  FROM whatsapp_hub.conversations c
  JOIN last_out lo ON lo.conversation_id = c.id
  JOIN whatsapp_hub.contacts ct ON ct.id = c.contact_id
  WHERE c.org_id = whatsapp_hub.current_org_id()
    AND c.status <> 'closed'
    AND c.lead_interest NOT IN ('venda_concluida', 'sem_interesse')
    AND c.id NOT IN (SELECT conversation_id FROM ever_responded)
    AND lo.created_at <= now() - (p_hours || ' hours')::interval
  ORDER BY lo.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION whatsapp_hub.non_responders(int) TO authenticated;
