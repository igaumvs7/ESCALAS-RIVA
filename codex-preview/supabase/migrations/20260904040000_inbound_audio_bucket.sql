-- ============================================================================
-- Bucket: whatsapp-hub-inbound-audio
-- ============================================================================
-- Áudio de voz recebido via WhatsApp (webjs/Baileys) -- o worker baixa e
-- descriptografa o arquivo original do WhatsApp (Baileys não entrega URL
-- pública, só binário criptografado) e sobe aqui pra virar um media_url de
-- verdade, que o pipeline de transcrição existente (trigger on_audio_inbound
-- -> transcribe-audio) já sabe consumir (mesmo formato usado pelo modelo
-- Zernio antigo: content_type='audio' + media_url http(s)).
--
-- Privado (não público): dono do áudio é o contato, não a organização --
-- mesma sensibilidade de dado que a base de conhecimento. Path:
-- <org_id>/<arquivo>. Escrita é só via worker (service role, bypassa RLS);
-- leitura de verdade acontece via signed URL (gerada pelo worker no upload,
-- gravada direto em media_url) -- a policy de SELECT abaixo é defesa em
-- profundidade, não o caminho principal de acesso.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-hub-inbound-audio',
  'whatsapp-hub-inbound-audio',
  false,
  25 * 1024 * 1024,
  ARRAY['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/amr', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS wh_inbound_audio_org_read ON storage.objects;

CREATE POLICY wh_inbound_audio_org_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-hub-inbound-audio'
    AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  );
