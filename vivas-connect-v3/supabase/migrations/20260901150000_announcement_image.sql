-- Pedido do dono: "quero poder anexar uma foto no painel que envio para
-- todos" (comunicado global da aba Sistema). Bucket público novo, só o
-- super admin escreve — mesmo padrão do whatsapp-hub-agent-media, sem
-- prefixo de org no path (comunicado é global, não por organização).

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.system_announcements
  ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-hub-announcements', 'whatsapp-hub-announcements', true, 10 * 1024 * 1024)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS wh_announcements_read           ON storage.objects;
DROP POLICY IF EXISTS wh_announcements_admin_insert   ON storage.objects;
DROP POLICY IF EXISTS wh_announcements_admin_delete   ON storage.objects;

CREATE POLICY wh_announcements_read
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'whatsapp-hub-announcements');

CREATE POLICY wh_announcements_admin_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-hub-announcements'
    AND whatsapp_hub.is_super_admin()
  );

CREATE POLICY wh_announcements_admin_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'whatsapp-hub-announcements'
    AND whatsapp_hub.is_super_admin()
  );
