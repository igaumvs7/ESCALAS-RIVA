-- Remove colunas exclusivas de Zernio/UAZAPI de whatsapp_hub.channels —
-- canais descontinuados, só webjs (Baileys) é usado. Nenhuma linha usa
-- esses providers hoje (confirmado antes de aplicar).
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

ALTER TABLE whatsapp_hub.channels
  DROP COLUMN IF EXISTS zernio_account_id,
  DROP COLUMN IF EXISTS uazapi_server_url,
  DROP COLUMN IF EXISTS uazapi_token_encrypted;
