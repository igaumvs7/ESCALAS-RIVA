-- ============================================================================
-- VIVAS · Fase 1.2: perfil público do corretor (agent_sites)
-- ----------------------------------------------------------------------------
-- · 1 linha por org (UNIQUE org_id) com os dados do perfil público que o
--   corretor edita em /settings e que é servido, sem login, em /c/:slug.
-- · Diferente de toda outra tabela de domínio: além da policy org-scoped
--   padrão para leitura/escrita autenticada, precisa de uma policy extra de
--   SELECT liberada para `anon` (a rota pública não tem sessão) restrita a
--   linhas com is_published = true e só às colunas exibidas na página (sem
--   dado sensível nesta tabela, então libera a linha inteira).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE TABLE whatsapp_hub.agent_sites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL UNIQUE REFERENCES whatsapp_hub.organizations(id),
  slug             TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL DEFAULT '',
  photo_url        TEXT,
  bio              TEXT NOT NULL DEFAULT '',
  whatsapp_number  TEXT NOT NULL DEFAULT '',
  listings         JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_sites_slug_format CHECK (slug ~ '^[a-z0-9](-?[a-z0-9])*$' AND length(slug) BETWEEN 3 AND 60)
);

CREATE TRIGGER trg_agent_sites_updated_at
  BEFORE UPDATE ON whatsapp_hub.agent_sites
  FOR EACH ROW EXECUTE FUNCTION whatsapp_hub.set_updated_at();

ALTER TABLE whatsapp_hub.agent_sites ENABLE ROW LEVEL SECURITY;

-- Membros da própria org (ativa) leem o próprio perfil, mesmo despublicado.
CREATE POLICY agent_sites_select ON whatsapp_hub.agent_sites
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

-- Só admin da org edita o perfil (mesmo padrão de app_settings/channels).
CREATE POLICY agent_sites_admin_write ON whatsapp_hub.agent_sites
  FOR ALL TO authenticated
  USING (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() = 'admin'
  )
  WITH CHECK (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() = 'admin'
  );

-- Rota pública /c/:slug: sem sessão, só linhas publicadas de org ativa.
CREATE POLICY agent_sites_public_read ON whatsapp_hub.agent_sites
  FOR SELECT TO anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM whatsapp_hub.organizations o
       WHERE o.id = agent_sites.org_id AND o.status = 'active'
    )
  );

GRANT SELECT ON whatsapp_hub.agent_sites TO anon;
