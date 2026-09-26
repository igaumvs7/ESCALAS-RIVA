-- ============================================================================
-- 20260824150000_agent_site_catalog
-- ----------------------------------------------------------------------------
-- Redesenho do Vivas Perfil (pedido do dono, 2026-08-24): capa + avatar,
-- mais campos de contato/identidade, cor de destaque própria da página
-- pública, e "listings" (title+url) vira "products" (catálogo de verdade:
-- foto + título + descrição + link opcional). Bucket novo pra foto de capa/
-- avatar/produto, mesmo padrão de RLS já usado em whatsapp-hub-agent-media
-- (leitura pública, escrita só admin da própria org).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.agent_sites
  ADD COLUMN IF NOT EXISTS cover_photo_url text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS accent_color_hex text NOT NULL DEFAULT '#3B82F6';

-- "listings" ({title,url}) → "products" ({title,description,photo_url,url}).
-- Mesma coluna JSONB, só renomeada — dado existente preservado; itens antigos
-- continuam válidos (photo_url/description ficam ausentes até o corretor
-- editar de novo).
ALTER TABLE whatsapp_hub.agent_sites RENAME COLUMN listings TO products;

-- Bucket de mídia do Vivas Perfil (capa, avatar, foto de produto).
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-hub-site-media', 'whatsapp-hub-site-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS wh_site_media_read          ON storage.objects;
DROP POLICY IF EXISTS wh_site_media_org_admin_insert ON storage.objects;
DROP POLICY IF EXISTS wh_site_media_org_admin_delete ON storage.objects;

-- Leitura pública (a página /c/:slug é pública, sem sessão).
CREATE POLICY wh_site_media_read
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'whatsapp-hub-site-media');

-- Upload apenas por admin da org, e só no path da própria org (<org_id>/<uuid>.<ext>).
CREATE POLICY wh_site_media_org_admin_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-hub-site-media'
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() = 'admin'
    AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  );

-- Remoção apenas por admin da org, restrita ao path da própria org.
CREATE POLICY wh_site_media_org_admin_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'whatsapp-hub-site-media'
    AND whatsapp_hub.current_user_role() = 'admin'
    AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  );
