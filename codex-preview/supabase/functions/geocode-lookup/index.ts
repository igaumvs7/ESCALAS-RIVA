// ============================================================================
// geocode-lookup
// ----------------------------------------------------------------------------
// Resolve um endereço/bairro em latitude/longitude (Nominatim, gratuito).
// Chamada pela tela "Mídias do agente" (AgentMediaSettings.tsx) quando o
// corretor preenche o bairro/endereço de uma mídia (ex.: foto de destaque de
// um empreendimento) — o valor cadastrado aqui é usado depois por
// process-ai-message pra calcular distância real quando um cliente pergunta
// por algo "perto de X".
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { geocodePlace } from '../_shared/geocoding.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    await requireOrgCaller(req);

    let body: { query?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const query = (body.query ?? '').trim();
    if (!query) {
      return jsonResponse({ ok: false, error: 'Informe um endereço ou bairro.' }, { status: 400 });
    }

    const result = await geocodePlace(query);
    if (!result) {
      return jsonResponse({ ok: false, error: 'Não conseguimos localizar esse endereço/bairro.' }, { status: 404 });
    }

    return jsonResponse({ ok: true, lat: result.lat, lon: result.lon, displayName: result.displayName });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('geocode-lookup error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
