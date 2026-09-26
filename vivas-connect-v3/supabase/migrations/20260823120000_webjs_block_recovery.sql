-- Detecção de bloqueio temporário (24h) do WhatsApp + estratégia de
-- recuperação de confiança do chip depois que o bloqueio passa.
--
-- status='blocked': detectado automaticamente (Baileys statusCode 403 —
-- "forbidden", ver sessionManager.js) OU marcado manualmente pelo corretor
-- (botão "Fui bloqueado" — nem sempre dá pra confiar 100% na detecção
-- automática, então existe o botão como camada de segurança).
--
-- Depois que blocked_until passa, o worker entra em "modo recuperação"
-- (recovery_until, recovery_daily_limit) — limite diário bem mais baixo e
-- delays maiores por alguns dias, pra reconstruir a confiança do número aos
-- poucos em vez de voltar direto no ritmo normal (o que arriscaria bloquear
-- de novo, agora com mais chance de virar banimento permanente).
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.webjs_sessions
  DROP CONSTRAINT webjs_sessions_status_check;

ALTER TABLE whatsapp_hub.webjs_sessions
  ADD CONSTRAINT webjs_sessions_status_check
  CHECK (status IN ('disconnected', 'qr', 'authenticated', 'ready', 'reconnecting', 'blocked'));

ALTER TABLE whatsapp_hub.webjs_sessions
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS block_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_until timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_daily_limit int;
