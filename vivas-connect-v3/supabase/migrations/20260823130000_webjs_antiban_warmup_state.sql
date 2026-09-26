-- Persiste o progresso de aquecimento da baileys-antiban (WarmUpState) —
-- sem isso, um reinicio do worker (deploy, queda, reboot da VPS) faz a
-- biblioteca "esquecer" que o numero ja estava aquecido e recomecar do
-- dia 1, mesmo pra numero estabelecido ha meses. O nosso proprio estado de
-- recuperacao (blocked_until/recovery_*) ja fica no banco - isso completa
-- a persistencia do lado da biblioteca tambem.
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.webjs_sessions
  ADD COLUMN IF NOT EXISTS antiban_warmup_state jsonb;
