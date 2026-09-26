-- Amplia a classificação de interesse do lead (era só interessado/sem
-- interesse) e cria o RPC que alimenta o relatório manual de
-- "não responderam" (substitui follow-up automático, que dependia do
-- Zernio/UAZAPI e foi descontinuado).
CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

ALTER TYPE lead_interest_status ADD VALUE IF NOT EXISTS 'qualificado';
ALTER TYPE lead_interest_status ADD VALUE IF NOT EXISTS 'venda_concluida';
