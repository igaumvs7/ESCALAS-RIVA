// ============================================================================
// webjs-activate
// ----------------------------------------------------------------------------
// Cria a linha em webjs_sessions pra org do caller (admin). A existencia da
// linha e o sinal que o worker (processo separado, fora da Vercel/Supabase,
// roda num VPS) usa pra saber que deve manter uma sessao whatsapp-web.js viva
// pra essa org. Nao faz mais nada aqui - o worker que conecta e gera o QR.
// ============================================================================

import { requireAdmin, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });

  try {
    const caller = await requireAdmin(req);
    const admin = getAdminClient();

    const { error } = await admin
      .schema('whatsapp_hub')
      .from('webjs_sessions')
      .upsert(
        { org_id: caller.orgId, status: 'disconnected', qr_data_url: null, last_error: null },
        { onConflict: 'org_id' },
      );
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('webjs-activate error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
