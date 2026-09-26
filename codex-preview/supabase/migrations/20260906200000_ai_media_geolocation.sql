-- Pedido do dono (2026-09-06): a IA de atendimento (process-ai-message)
-- precisa (1) conseguir de fato ENVIAR a mídia que ela já decide mandar via
-- marcador [MEDIA:rotulo] (hoje bloqueado de propósito em
-- _shared/inbox-delivery.ts com "ainda não é suportado no canal webjs") e
-- (2) saber a localização de cada mídia (ex.: foto de destaque de um
-- empreendimento) pra calcular distância real até um lugar que o cliente
-- mencione ("mais perto da Praia do Futuro"). Geocodificação via Nominatim
-- (OpenStreetMap, gratuito, sem chave) — ver supabase/functions/_shared/geocoding.ts.
--
-- Campos opcionais: nem toda mídia é "geolocalizável" (um áudio de saudação
-- não tem bairro) — só quem preencher bairro/endereço na tela de Mídias do
-- agente ganha latitude/longitude, e só essas entram no cálculo de distância.
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.ai_agent_media
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
