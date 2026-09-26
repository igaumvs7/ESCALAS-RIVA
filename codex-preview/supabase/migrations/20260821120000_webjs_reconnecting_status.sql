-- ============================================================================
-- VIVAS · webjs_sessions ganha o status 'reconnecting' — usado pelo worker
-- (Baileys) quando a conexao cai por motivo diferente de logout manual
-- (queda de rede, reinicio do WhatsApp etc.) e ele tenta reconectar sozinho,
-- sem exigir novo QR. Sem esse status, a tela ficava mostrando "Conectado"
-- durante uma queda de verdade (o campo status simplesmente nao mudava).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.webjs_sessions
  DROP CONSTRAINT webjs_sessions_status_check;

ALTER TABLE whatsapp_hub.webjs_sessions
  ADD CONSTRAINT webjs_sessions_status_check
  CHECK (status IN ('disconnected', 'qr', 'authenticated', 'ready', 'reconnecting'));
