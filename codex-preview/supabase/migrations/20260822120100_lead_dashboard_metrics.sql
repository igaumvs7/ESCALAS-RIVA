-- RPC que alimenta o novo Dashboard de Leads (substitui o antigo dashboard
-- de vendas/R$). SECURITY INVOKER (padrão) - respeita RLS/current_org_id()
-- do usuário chamador, não vaza dado de outra org.
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE OR REPLACE FUNCTION whatsapp_hub.lead_dashboard_metrics(p_from timestamptz, p_to timestamptz)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = whatsapp_hub, pg_temp
AS $$
  WITH last_msg AS (
    SELECT DISTINCT ON (conversation_id) conversation_id, sender_type, direction
    FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id()
      AND is_private_note = false
      AND created_at <= p_to
    ORDER BY conversation_id, created_at DESC
  ),
  sent AS (
    SELECT count(*) AS n FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id()
      AND direction = 'outbound' AND is_private_note = false
      AND created_at BETWEEN p_from AND p_to
  ),
  contacted AS (
    SELECT count(DISTINCT conversation_id) AS n FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id()
      AND direction = 'outbound' AND is_private_note = false
      AND created_at BETWEEN p_from AND p_to
  ),
  responded AS (
    SELECT count(DISTINCT conversation_id) AS n FROM whatsapp_hub.messages
    WHERE org_id = whatsapp_hub.current_org_id()
      AND direction = 'inbound'
      AND created_at BETWEEN p_from AND p_to
  ),
  waiting_ai AS (
    SELECT count(*) AS n FROM whatsapp_hub.conversations c
    JOIN last_msg lm ON lm.conversation_id = c.id
    WHERE c.org_id = whatsapp_hub.current_org_id()
      AND c.status <> 'closed'
      AND lm.sender_type = 'ai' AND lm.direction = 'outbound'
  ),
  by_status AS (
    SELECT
      count(*) FILTER (WHERE status = 'human_active') AS transferred_human,
      count(*) FILTER (WHERE status = 'closed') AS closed_count,
      count(*) FILTER (WHERE status <> 'closed') AS open_count,
      count(*) FILTER (WHERE lead_interest = 'interessado') AS interested,
      count(*) FILTER (WHERE lead_interest = 'sem_interesse') AS not_interested
    FROM whatsapp_hub.conversations
    WHERE org_id = whatsapp_hub.current_org_id()
  ),
  by_tag AS (
    SELECT coalesce(json_agg(json_build_object('name', t.name, 'color', t.color, 'count', tag_counts.n) ORDER BY tag_counts.n DESC), '[]'::json) AS tags
    FROM (
      SELECT ct.tag_id, count(*) AS n
      FROM whatsapp_hub.contact_tags ct
      JOIN whatsapp_hub.contacts c ON c.id = ct.contact_id
      WHERE c.org_id = whatsapp_hub.current_org_id()
      GROUP BY ct.tag_id
    ) tag_counts
    JOIN whatsapp_hub.tags t ON t.id = tag_counts.tag_id
  )
  SELECT json_build_object(
    'sent', (SELECT n FROM sent),
    'contacted', (SELECT n FROM contacted),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT n FROM contacted) - (SELECT n FROM responded), 0),
    'waiting_ai', (SELECT n FROM waiting_ai),
    'transferred_human', (SELECT transferred_human FROM by_status),
    'closed', (SELECT closed_count FROM by_status),
    'open', (SELECT open_count FROM by_status),
    'interested', (SELECT interested FROM by_status),
    'not_interested', (SELECT not_interested FROM by_status),
    'by_tag', (SELECT tags FROM by_tag)
  );
$$;

GRANT EXECUTE ON FUNCTION whatsapp_hub.lead_dashboard_metrics(timestamptz, timestamptz) TO authenticated;
