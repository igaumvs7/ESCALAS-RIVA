-- Bug real reportado pelo dono (2026-09-06, direto em produção): "não é que
-- não responderam, eu nem enviei". "Não responderam" era calculado como
-- total_contacts - responded, então todo contato NUNCA CONTATADO (nem
-- campanha, nem mensagem 1:1) caía automaticamente em "não respondeu" —
-- mesmo categoria de erro que "Espontâneos" tinha (ver migration
-- 20260906170000): confundir "ausência de sinal positivo" com "sinal
-- negativo". "Não responderam" só faz sentido pra quem foi CONTATADO
-- (campanha alguma vez OU mensagem 1:1 enviada alguma vez) e mesmo assim
-- não respondeu no período.
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
  total_contacts AS (
    SELECT count(*) AS n FROM whatsapp_hub.contacts WHERE org_id = whatsapp_hub.current_org_id()
  ),
  campaign_reached AS (
    SELECT DISTINCT contact_id FROM whatsapp_hub.campaign_contacts
    WHERE org_id = whatsapp_hub.current_org_id()
      AND status IN ('sent', 'delivered', 'read', 'replied')
  ),
  ever_inbound AS (
    SELECT DISTINCT c.contact_id
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
  ),
  ever_outbound AS (
    SELECT DISTINCT c.contact_id
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'outbound'
  ),
  contacted AS (
    SELECT contact_id FROM campaign_reached
    UNION
    SELECT contact_id FROM ever_outbound
  ),
  reached_via_campaign AS (
    SELECT count(*) AS n FROM campaign_reached
  ),
  spontaneous AS (
    SELECT count(*) AS n FROM whatsapp_hub.contacts ct
    WHERE ct.org_id = whatsapp_hub.current_org_id()
      AND ct.id NOT IN (SELECT contact_id FROM campaign_reached)
      AND ct.id IN (SELECT contact_id FROM ever_inbound)
  ),
  responded AS (
    SELECT count(DISTINCT c.contact_id) AS n
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
      AND m.created_at BETWEEN p_from AND p_to
  ),
  responded_of_contacted AS (
    SELECT count(DISTINCT c.contact_id) AS n
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
      AND m.created_at BETWEEN p_from AND p_to
      AND c.contact_id IN (SELECT contact_id FROM contacted)
  ),
  waiting_ai AS (
    SELECT count(*) AS n FROM whatsapp_hub.conversations c
    JOIN last_msg lm ON lm.conversation_id = c.id
    WHERE c.org_id = whatsapp_hub.current_org_id()
      AND c.status = 'ai_active'
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
    'total_contacts', (SELECT n FROM total_contacts),
    'reached_via_campaign', (SELECT n FROM reached_via_campaign),
    'spontaneous_contacts', (SELECT n FROM spontaneous),
    'awaiting_first_contact', greatest((SELECT n FROM total_contacts) - (SELECT n FROM reached_via_campaign) - (SELECT n FROM spontaneous), 0),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT count(*) FROM contacted) - (SELECT n FROM responded_of_contacted), 0),
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

CREATE OR REPLACE FUNCTION whatsapp_hub.lead_dashboard_segment_detail(p_segment text, p_from timestamptz, p_to timestamptz)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = whatsapp_hub, pg_temp
AS $$
  WITH campaign_reached AS (
    SELECT DISTINCT contact_id FROM whatsapp_hub.campaign_contacts
    WHERE org_id = whatsapp_hub.current_org_id()
      AND status IN ('sent', 'delivered', 'read', 'replied')
  ),
  ever_inbound AS (
    SELECT DISTINCT c.contact_id
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
  ),
  ever_outbound AS (
    SELECT DISTINCT c.contact_id
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'outbound'
  ),
  contacted AS (
    SELECT contact_id FROM campaign_reached
    UNION
    SELECT contact_id FROM ever_outbound
  ),
  segment_contacts AS (
    SELECT ct.id AS contact_id
    FROM whatsapp_hub.contacts ct
    WHERE ct.org_id = whatsapp_hub.current_org_id()
      AND (
        p_segment = 'total'
        OR (p_segment = 'campaign' AND ct.id IN (SELECT contact_id FROM campaign_reached))
        OR (p_segment = 'spontaneous' AND ct.id NOT IN (SELECT contact_id FROM campaign_reached) AND ct.id IN (SELECT contact_id FROM ever_inbound))
        OR (p_segment = 'awaiting' AND ct.id NOT IN (SELECT contact_id FROM campaign_reached) AND ct.id NOT IN (SELECT contact_id FROM ever_inbound))
      )
  ),
  seg_total AS (
    SELECT count(*) AS n FROM segment_contacts
  ),
  seg_contacted AS (
    SELECT count(*) AS n FROM segment_contacts sc WHERE sc.contact_id IN (SELECT contact_id FROM contacted)
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.sender_type, m.direction
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.is_private_note = false
      AND m.created_at <= p_to
      AND c.contact_id IN (SELECT contact_id FROM segment_contacts)
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  responded AS (
    SELECT count(DISTINCT c.contact_id) AS n
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
      AND m.created_at BETWEEN p_from AND p_to
      AND c.contact_id IN (SELECT contact_id FROM segment_contacts)
  ),
  responded_of_contacted AS (
    SELECT count(DISTINCT c.contact_id) AS n
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
      AND m.created_at BETWEEN p_from AND p_to
      AND c.contact_id IN (SELECT contact_id FROM segment_contacts)
      AND c.contact_id IN (SELECT contact_id FROM contacted)
  ),
  waiting_ai AS (
    SELECT count(*) AS n FROM whatsapp_hub.conversations c
    JOIN last_msg lm ON lm.conversation_id = c.id
    WHERE c.org_id = whatsapp_hub.current_org_id()
      AND c.status = 'ai_active'
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
      AND contact_id IN (SELECT contact_id FROM segment_contacts)
  )
  SELECT json_build_object(
    'total', (SELECT n FROM seg_total),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT n FROM seg_contacted) - (SELECT n FROM responded_of_contacted), 0),
    'waiting_ai', (SELECT n FROM waiting_ai),
    'transferred_human', (SELECT transferred_human FROM by_status),
    'closed', (SELECT closed_count FROM by_status),
    'open', (SELECT open_count FROM by_status),
    'interested', (SELECT interested FROM by_status),
    'not_interested', (SELECT not_interested FROM by_status),
    'qualified', (SELECT qualified FROM by_status),
    'sold', (SELECT sold FROM by_status)
  );
$$;
