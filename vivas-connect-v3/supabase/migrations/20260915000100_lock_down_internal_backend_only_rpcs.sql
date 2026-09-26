-- ============================================================================
-- FIX DE SEGURANÇA (auditoria 2026-09-15, pedido do dono): 4 funções
-- SECURITY DEFINER estavam com EXECUTE liberado pra `authenticated` E `anon`
-- sem checagem nenhuma de dono/organização por dentro — inconsistente com o
-- padrão já usado em outras RPCs internas do schema (capture_activity_
-- snapshot, process_subscription_lifecycle, seed_org_defaults, etc., todas
-- já corretamente restritas a service_role).
--
-- Achados (nenhum tem chamador em src/, supabase/functions/ ou webjs-worker/
-- fora do próprio banco, exceto increment_unread_count):
--
-- 1. whatsapp_hub._fanout_notification(p_org, ...) — insere notificação pra
--    todo admin/operator de QUALQUER org, sem checar se quem chama pertence
--    a essa org. Só é usada via PERFORM de dentro de outras funções (gatilho
--    de handoff/mensagem). Exposta como RPC, qualquer usuário logado (ou
--    até anônimo, com a chave anon) conseguiria injetar notificação falsa
--    pra dentro do inbox de QUALQUER organização (vetor de phishing/spam
--    dentro do próprio produto).
--
-- 2. whatsapp_hub.bump_campaign_counter(p_campaign_id, p_column, p_delta) —
--    sem checagem de dono da campanha. CÓDIGO MORTO hoje (nada no repo
--    chama, sobrou de uma arquitetura de disparo anterior), mas exposto e
--    exploitável: qualquer chamador podia inflar/zerar métricas de disparo
--    (sent/delivered/read/replied/failed) de campanha de QUALQUER org só
--    sabendo o campaign_id.
--
-- 3. whatsapp_hub.claim_campaign_contacts(p_campaign_id, p_limit) — mesmo
--    caso: sem checagem de org, também código morto hoje, mas permitia
--    "roubar"/travar (claimed_at) contatos pendentes de campanha de
--    QUALQUER org e ler de volta linhas de campaign_contacts que não são
--    suas.
--
-- 4. whatsapp_hub.increment_unread_count(p_conversation_id) — EM USO real
--    (webjs-worker/src/inbound.js, via service_role), sem checagem de org.
--    Qualquer chamador conseguia inflar o contador de não-lidas de QUALQUER
--    conversa de QUALQUER org, só sabendo/adivinhando o UUID.
--
-- Fix: revogar EXECUTE de PUBLIC/authenticated/anon nas 4 (fecha o buraco
-- por completo, já que nenhuma delas tem uso legítimo fora do backend/banco)
-- e garantir explicitamente que service_role continua podendo chamar a que
-- está em uso de verdade (increment_unread_count).
--
-- Já aplicado direto em produção via Supabase MCP em 2026-09-15 — este
-- arquivo só registra a mudança no histórico do repositório.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION whatsapp_hub._fanout_notification(uuid, whatsapp_hub.notification_type, uuid, uuid, text, text) FROM PUBLIC, authenticated, anon;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.bump_campaign_counter(uuid, text, integer) FROM PUBLIC, authenticated, anon;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.claim_campaign_contacts(uuid, integer) FROM PUBLIC, authenticated, anon;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.increment_unread_count(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.increment_unread_count(uuid) TO service_role;
