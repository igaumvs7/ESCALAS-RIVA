import { createClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// Rate limit caseiro para os endpoints públicos (api/validate.ts e
// api/bootstrap.ts), sem contratar nenhum serviço externo (Upstash etc.) —
// o dono confirmou que Vercel/GitHub/Supabase são todos plano gratuito e não
// quer dependência paga nova. Usa a função `public.check_rate_limit` (ver
// migration 20260920120000_rate_limit_caseiro.sql), que só o service role
// pode chamar.
//
// Falha aberta: se SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ainda não
// existirem (ex.: a primeiríssima chamada de bootstrap, antes de o setup
// terminar) ou se a chamada ao banco falhar por qualquer motivo, a checagem
// é pulada e a requisição segue normal. A intenção é conter abuso, nunca
// derrubar gente de verdade por causa de uma dependência interna instável —
// mesmo princípio do `isPasswordLeaked` em src/lib/authErrors.ts.
// ----------------------------------------------------------------------------

export async function checkRateLimit(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;

  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export function clientIp(headers: Record<string, string | string[] | undefined> | undefined): string {
  const forwarded = headers?.['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (value ?? 'unknown').split(',')[0].trim();
}
