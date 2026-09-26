-- Adiciona o preset "moderado" (220 msgs/dia) pedido pelo dono como meio-termo
-- entre seguro (150) e arriscado (250) — precisa entrar no CHECK de `mode`
-- de whatsapp_hub.dispatch_settings (migração 20260827120000).
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.dispatch_settings
  DROP CONSTRAINT dispatch_settings_mode_check;

ALTER TABLE whatsapp_hub.dispatch_settings
  ADD CONSTRAINT dispatch_settings_mode_check
  CHECK (mode IN ('safe', 'moderate', 'risky', 'manual'));
