-- Detalhe ao clicar num dos 3 cards de base de contatos (Total / Alcançados
-- via disparo em massa / Espontâneos) — pedido do dono (2026-09-06): "quero
-- poder clicar no total de contatos e ver de quanto esse total, quantos me
-- responderam, quantos tiveram interesse, quantos a IA respondeu... como se
-- fosse um filtro".
--
-- Mesmo cálculo do funil do `lead_dashboard_metrics`, só que restrito ao
-- CONJUNTO de contatos do segmento clicado, em vez da org inteira.
SET search_path TO whatsapp_hub, public;

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
  segment_contacts AS (
    SELECT ct.id AS contact_id
    FROM whatsapp_hub.contacts ct
    WHERE ct.org_id = whatsapp_hub.current_org_id()
      AND (
        p_segment = 'total'
        OR (p_segment = 'campaign' AND ct.id IN (SELECT contact_id FROM campaign_reached))
        OR (p_segment = 'spontaneous' AND ct.id NOT IN (SELECT contact_id FROM campaign_reached))
      )
  ),
  seg_total AS (
    SELECT count(*) AS n FROM segment_contacts
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
      AND contact_id IN (SELECT contact_id FROM segment_contacts)
  )
  SELECT json_build_object(
    'total', (SELECT n FROM seg_total),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT n FROM seg_total) - (SELECT n FROM responded), 0),
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

GRANT EXECUTE ON FUNCTION whatsapp_hub.lead_dashboard_segment_detail(text, timestamptz, timestamptz) TO authenticated;
