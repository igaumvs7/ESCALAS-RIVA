-- ============================================================================
-- webjs 1:1 outbound: coluna pra correlacionar a mensagem inserida pela Edge
-- Function com o id que o Baileys devolve depois de enviar de verdade.
-- ----------------------------------------------------------------------------
-- Fluxo (espelha o padrao ja usado em campaign_contacts pro webjs-worker):
--   1. process-ai-message / send-operator-message insere a linha em messages
--      (outbound, webjs_message_id NULL) SEM tentar enviar synchronamente —
--      o socket Baileys vive no worker, fora da Edge Function.
--   2. webjs-worker faz polling de messages com webjs_message_id NULL numa
--      conversa de canal 'webjs', envia pelo socket, e preenche esta coluna.
-- ============================================================================

SET search_path TO whatsapp_hub;

ALTER TABLE whatsapp_hub.messages
  ADD COLUMN IF NOT EXISTS webjs_message_id TEXT;

COMMENT ON COLUMN whatsapp_hub.messages.webjs_message_id IS
  'Id da mensagem no Baileys apos o envio real pelo worker. NULL + direction=outbound + conversa de canal webjs = ainda pendente de envio.';
