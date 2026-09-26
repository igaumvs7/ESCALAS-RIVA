// ============================================================================
// webjs-deactivate
// ----------------------------------------------------------------------------
// Apaga a linha de webjs_sessions da org do caller (admin). O worker, ao nao
// achar mais a linha no proximo ciclo, encerra a sessao whatsapp-web.js e
// limpa os dados de autenticacao locais dessa org. Tambem desativa (nao
// apaga - preserva historico) o channels correspondente, se existir.
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

    const { error: delErr } = await admin
      .schema('whatsapp_hub')
      .from('webjs_sessions')
      .delete()
      .eq('org_id', caller.orgId);
    if (delErr) throw delErr;

    await admin
      .schema('whatsapp_hub')
      .from('channels')
      .update({ is_active: false })
      .eq('org_id', caller.orgId)
      .eq('provider', 'webjs');

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('webjs-deactivate error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
