-- Fecha 3 funcoes SECURITY DEFINER que aceitavam p_org_id sem conferir quem
-- chamou. Um cliente LOGADO da org A podia passar o UUID da org B e:
--   knowledge_search                 -> LER a base de conhecimento da org B
--   consume_professor_resposta_usage -> ZERAR a cota diaria da org B
--   get_professor_resposta_usage     -> ler o uso da org B
-- Viola a regra do proprio CLAUDE.md ("nunca confiar cegamente no parametro").
--
-- As 3 sao chamadas SOMENTE por Edge Function com service_role (verificado por
-- grep em todo src/): professor-resposta/index.ts:107 e :134,
-- process-ai-message/index.ts:607. service_role ignora GRANT, entao remover o
-- acesso de authenticated/anon nao quebra nenhum caminho legitimo.
REVOKE EXECUTE ON FUNCTION whatsapp_hub.knowledge_search(vector, integer, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION whatsapp_hub.consume_professor_resposta_usage(uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION whatsapp_hub.get_professor_resposta_usage(uuid) FROM authenticated, anon;

-- Defesa em profundidade: se alguem reconceder o EXECUTE por engano, a funcao
-- passa a se defender sozinha (mesmo padrao de mark_webjs_blocked).
CREATE OR REPLACE FUNCTION whatsapp_hub.knowledge_search(
  p_query_embedding vector, p_top_k integer DEFAULT 5, p_org_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(id uuid, knowledge_base_id uuid, content text, similarity real)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'whatsapp_hub','public','pg_temp' AS $function$
DECLARE v_org UUID := COALESCE(p_org_id, whatsapp_hub.current_org_id());
BEGIN
  IF v_org IS NULL THEN RETURN; END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF v_org IS DISTINCT FROM whatsapp_hub.current_org_id() THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;
  RETURN QUERY
  SELECT kc.id, kc.knowledge_base_id, kc.content,
         (1 - (kc.embedding <=> p_query_embedding))::real
  FROM whatsapp_hub.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL AND kc.org_id = v_org
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_top_k, 50));
END; $function$;
REVOKE EXECUTE ON FUNCTION whatsapp_hub.knowledge_search(vector, integer, uuid) FROM authenticated, anon;
