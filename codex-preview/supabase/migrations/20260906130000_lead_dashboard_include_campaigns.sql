-- "Contatos alcançados" só contava mensagens da tabela `messages` (respostas
-- 1:1 de IA/operador) — o disparo em massa (campaignWorker.js) NUNCA grava
-- linha em `messages`, só atualiza `campaign_contacts.status/sent_at`. Como o
-- disparo em massa (Vivas Envia) é o principal canal de alcance do corretor,
-- a métrica ficava quase vazia na prática. Pedido do dono (2026-09-06): "tem
-- que mostrar tudo e todos os contatos".
--
-- Fix: "contatos alcançados" e "responderam" passam a contar por CONTATO
-- distinto (não mais conversa), somando as DUAS fontes de envio (mensagens
-- 1:1 + campanhas em massa). Adiciona também `total_contacts` (TODOS os
-- contatos da org, sem filtro de período) — auditoria real (2026-09-06):
-- uma org com 316 contatos importados mas nenhuma campanha disparada ainda
-- mostrava "alcançados" perto de zero, o que pareceu incompleto/errado.
-- Os dois números lado a lado deixam claro: "quantos eu tenho" vs "quantos
-- eu já cheguei a mandar mensagem".
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
    SELECT count(DISTINCT contact_id) AS n FROM (
      SELECT c.contact_id
      FROM whatsapp_hub.messages m
      JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
      WHERE m.org_id = whatsapp_hub.current_org_id()
        AND m.direction = 'outbound' AND m.is_private_note = false
        AND m.created_at BETWEEN p_from AND p_to
      UNION
      SELECT cc.contact_id
      FROM whatsapp_hub.campaign_contacts cc
      WHERE cc.org_id = whatsapp_hub.current_org_id()
        AND cc.status IN ('sent', 'delivered', 'read', 'replied')
        AND cc.sent_at BETWEEN p_from AND p_to
    ) reached
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
  ),
  total_contacts AS (
    SELECT count(*) AS n FROM whatsapp_hub.contacts WHERE org_id = whatsapp_hub.current_org_id()
  )
  SELECT json_build_object(
    'total_contacts', (SELECT n FROM total_contacts),
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
