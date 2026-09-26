-- ============================================================================
-- Indice unico parcial sobre webjs_message_id — mesma defesa que ja existe
-- pra zernio_message_id (20260610130000): Baileys pode reentregar a mesma
-- mensagem (reconexao, sync de historico), e o worker faz select-before-insert
-- mas isso nao e atomico. Com o indice, um insert duplicado falha com 23505
-- em vez de criar uma segunda linha (que disparia o trigger de IA de novo).
-- ============================================================================

SET search_path TO whatsapp_hub;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_webjs_message_id
  ON whatsapp_hub.messages (webjs_message_id)
  WHERE webjs_message_id IS NOT NULL;
