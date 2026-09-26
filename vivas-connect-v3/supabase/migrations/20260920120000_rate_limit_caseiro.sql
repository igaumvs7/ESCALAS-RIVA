-- ============================================================================
-- RATE LIMIT CASEIRO (pedido do dono, 2026-09-20): api/validate.ts e
-- api/bootstrap.ts são endpoints públicos (sem login) e não tinham nenhum
-- limite de chamadas — alguém podia bater neles quantas vezes quisesse.
--
-- Em vez de contratar um serviço pago (Upstash etc. — o dono confirmou que
-- Vercel/GitHub/Supabase são todos plano gratuito e não quer dependência
-- nova), o limite é feito com o próprio Postgres do projeto: uma tabela de
-- contadores por "bucket" (endpoint + IP) e uma função que incrementa e
-- decide, atômica, chamada só pelo service role.
--
-- A função é SECURITY DEFINER (precisa, pra sempre conseguir escrever no
-- contador independente de quem chama), mas o REVOKE/GRANT abaixo garante
-- que só o service role executa — o mesmo cuidado que faltou nas 3 funções
-- apontadas em 03-AUDITORIA-SEGURANCA.md (`knowledge_search`,
-- `consume_professor_resposta_usage`, `get_professor_resposta_usage`), pra
-- não repetir o mesmo erro aqui.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._api_rate_limit (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public._api_rate_limit ENABLE ROW LEVEL SECURITY;
-- RLS habilitada sem nenhuma policy = acesso zero pra anon/authenticated,
-- mesmo padrão já usado em _bootstrap_state/app_settings/org_settings.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public._api_rate_limit (bucket, window_start, count)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET count = CASE
          WHEN public._api_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
            THEN 1
          ELSE public._api_rate_limit.count + 1
        END,
        window_start = CASE
          WHEN public._api_rate_limit.window_start < now() - make_interval(secs => p_window_seconds)
            THEN now()
          ELSE public._api_rate_limit.window_start
        END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- REVOKE ALL FROM PUBLIC não é suficiente: o Supabase concede EXECUTE direto
-- pros papéis anon/authenticated por padrão em toda função nova do schema
-- public (confirmado pelo advisor de segurança logo após criar esta função -
-- mesma armadilha de GRANT amplo já documentada em 03-AUDITORIA-SEGURANCA.md
-- para tabelas). Por isso o REVOKE abaixo é explícito nos dois papéis, não só
-- em PUBLIC.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
