-- Painel de Leads (substitui o foco em vendas/R$ do dashboard por contagem
-- de leads). Classificação de interesse é manual por enquanto (operador
-- marca); classificação automática pela IA fica pra uma fase futura.
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_interest_status') THEN
    CREATE TYPE lead_interest_status AS ENUM ('nao_classificado', 'interessado', 'sem_interesse');
  END IF;
END $$;

ALTER TABLE whatsapp_hub.conversations
  ADD COLUMN IF NOT EXISTS lead_interest lead_interest_status NOT NULL DEFAULT 'nao_classificado';

CREATE INDEX IF NOT EXISTS idx_conversations_lead_interest
  ON whatsapp_hub.conversations (org_id, lead_interest);
