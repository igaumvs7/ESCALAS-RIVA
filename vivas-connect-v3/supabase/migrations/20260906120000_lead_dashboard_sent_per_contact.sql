-- "Mensagens enviadas" contava toda mensagem individual (10 msgs pra 1
-- pessoa = 10). Pedido do dono (2026-09-06): contar por CONTATO, não por
-- mensagem — 10 mensagens pra mesma pessoa deve valer 1, não 10. Passa a
-- usar a mesma regra de `contacted` (conversas distintas alcançadas no
-- período).
SET search_path TO whatsapp_hub, public;

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
      count(*) FILTER (WHERE lead_interest = 'sem_interesse') AS not_interested,
      count(*) FILTER (WHERE lead_interest = 'qualificado') AS qualified,
      count(*) FILTER (WHERE lead_interest = 'venda_concluida') AS sold
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
    'sent', (SELECT n FROM contacted),
    'contacted', (SELECT n FROM contacted),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT n FROM contacted) - (SELECT n FROM responded), 0),
    'waiting_ai', (SELECT n FROM waiting_ai),
    'transferred_human', (SELECT transferred_human FROM by_status),
    'closed', (SELECT closed_count FROM by_status),
    'open', (SELECT open_count FROM by_status),
    'interested', (SELECT interested FROM by_status),
    'not_interested', (SELECT not_interested FROM by_status),
    'qualified', (SELECT qualified FROM by_status),
    'sold', (SELECT sold FROM by_status),
    'by_tag', (SELECT tags FROM by_tag)
  );
$$;
