-- Reformulação do bloco "base de contatos" do dashboard, decidida em
-- conversa com o dono (2026-09-06) depois de 2 tentativas anteriores não
-- terem feito sentido pra ele:
--   1ª: "contatos alcançados" = quem recebeu mensagem 1:1 OU campanha, no
--       período selecionado → confuso ao lado de "total".
--   2ª: "contatos alcançados" = "total de contatos" (a mesma coisa) → ele
--       achou redundante ter os dois.
--   3ª (esta, ideia do próprio dono): "contatos alcançados" = SÓ quem
--       recebeu mensagem via DISPARO EM MASSA (campanha) — em qualquer
--       período, desde sempre. E um card novo, "contatos espontâneos" =
--       quem NUNCA recebeu campanha nenhuma (chegou sozinho: respondeu um
--       inbound, veio do Vivas Perfil, foi respondido só 1:1 etc.).
--
-- Os 3 números do topo (total / alcançados via campanha / espontâneos)
-- passam a ser SEMPRE "de qualquer período" (não usam p_from/p_to) — são
-- uma foto da base de contatos como um todo, não uma métrica de atividade
-- no período escolhido nas abas Hoje/7d/30d/etc. Total = alcançados +
-- espontâneos, sempre.
--
-- "responderam"/"não responderam" continuam period-aware (atividade real no
-- período), só que agora usam `total_contacts` como base em vez do antigo
-- "contacted" (que não existe mais como conceito período-a-período).
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
  -- Alcançados via disparo em massa — QUALQUER período em que a campanha
  -- rodou, desde sempre (não filtra por p_from/p_to: é "já foi alcançado
  -- alguma vez", não "foi alcançado NESSE período").
  reached_via_campaign AS (
    SELECT count(DISTINCT contact_id) AS n
    FROM whatsapp_hub.campaign_contacts
    WHERE org_id = whatsapp_hub.current_org_id()
      AND status IN ('sent', 'delivered', 'read', 'replied')
  ),
  responded AS (
    SELECT count(DISTINCT c.contact_id) AS n
    FROM whatsapp_hub.messages m
    JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
    WHERE m.org_id = whatsapp_hub.current_org_id()
      AND m.direction = 'inbound'
      AND m.created_at BETWEEN p_from AND p_to
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
    'total_contacts', (SELECT n FROM total_contacts),
    'reached_via_campaign', (SELECT n FROM reached_via_campaign),
    'spontaneous_contacts', greatest((SELECT n FROM total_contacts) - (SELECT n FROM reached_via_campaign), 0),
    'responded', (SELECT n FROM responded),
    'not_responded', greatest((SELECT n FROM total_contacts) - (SELECT n FROM responded), 0),
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
