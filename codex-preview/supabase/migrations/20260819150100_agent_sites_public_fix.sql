-- ============================================================================
-- VIVAS · Fase 1.2 fix: a policy agent_sites_public_read (anon) checava
-- `organizations.status` com uma subquery direta — mas RLS de organizations
-- (orgs_member_select) só libera pro membro da própria org ou super admin,
-- então a subquery sempre via 0 linhas pra `anon` e a policy nunca liberava
-- nada, mesmo com GRANT SELECT. Corrige com uma função SECURITY DEFINER que
-- ignora RLS só pra checar se a org está ativa (não vaza mais nada disso).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub._org_is_active(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_hub.organizations
     WHERE id = p_org_id AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub._org_is_active(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION whatsapp_hub._org_is_active(UUID) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS agent_sites_public_read ON whatsapp_hub.agent_sites;
CREATE POLICY agent_sites_public_read ON whatsapp_hub.agent_sites
  FOR SELECT TO anon
  USING (is_published = true AND whatsapp_hub._org_is_active(org_id));
