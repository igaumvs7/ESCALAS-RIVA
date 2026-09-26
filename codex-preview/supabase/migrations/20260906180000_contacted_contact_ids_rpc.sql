-- Pedido do dono (2026-09-06): filtro "já enviei mensagem" / "não enviei"
-- na página de Contatos, usando o mesmo sinal do dashboard (campanha OU
-- mensagem 1:1 enviada). RPC dedicada em vez de join client-side (mais
-- seguro que embedded-select ambíguo do PostgREST e mais leve que puxar
-- linha a linha de `messages` pro cliente).
SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.contacted_contact_ids()
RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
SET search_path = whatsapp_hub, pg_temp
AS $$
  SELECT DISTINCT contact_id FROM whatsapp_hub.campaign_contacts
  WHERE org_id = whatsapp_hub.current_org_id()
    AND status IN ('sent', 'delivered', 'read', 'replied')
  UNION
  SELECT DISTINCT c.contact_id
  FROM whatsapp_hub.messages m
  JOIN whatsapp_hub.conversations c ON c.id = m.conversation_id
  WHERE m.org_id = whatsapp_hub.current_org_id()
    AND m.direction = 'outbound';
$$;

GRANT EXECUTE ON FUNCTION whatsapp_hub.contacted_contact_ids() TO authenticated;
