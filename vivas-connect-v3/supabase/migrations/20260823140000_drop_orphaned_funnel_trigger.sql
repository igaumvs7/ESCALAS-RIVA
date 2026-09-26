-- O gatilho chamava a Edge Function funnel-automation, removida junto com
-- Zernio/UAZAPI (dependia deles) e já órfã desde a remoção da UI do Funil
-- (sem tela pra criar pipeline/etapa, o gatilho nunca teria automação pra
-- rodar mesmo). 0 linhas em whatsapp_hub.deals hoje — remoção sem risco de
-- dado. Mantém a tabela deals e a função _on_deal_stage_automation() por
-- enquanto, só desativa o gatilho.
SET search_path TO whatsapp_hub, public;

DROP TRIGGER IF EXISTS on_deal_stage_automation ON whatsapp_hub.deals;
