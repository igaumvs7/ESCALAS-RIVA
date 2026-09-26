-- "Fixar conversa no topo" do inbox — pedido do dono (2026-09-05). Campo
-- simples e independente da nota fixa (pinned_note, que é um texto por
-- conversa) — aqui é só um booleano pra ordenação.
SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.conversations
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS conversations_pinned_idx ON whatsapp_hub.conversations(pinned) WHERE pinned;
