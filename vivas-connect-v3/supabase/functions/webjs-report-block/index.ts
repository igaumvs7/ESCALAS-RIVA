// ============================================================================
// webjs-report-block
// ----------------------------------------------------------------------------
// Botão manual "Fui bloqueado" — camada de segurança pra quando a detecção
// automática (código 403 no sessionManager.js) não pegar o bloqueio (nem
// sempre dá pra confiar 100% no sinal do Baileys). O corretor percebe que
// o WhatsApp Web saiu do notebook com aviso de bloqueio e reporta aqui.
//
// Chama o mesmo RPC (mark_webjs_blocked) que a detecção automática usa —
// uma regra só de escalonamento/recuperação, nunca duas versões divergentes.
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
      .rpc('mark_webjs_blocked', {
        p_org_id: caller.orgId,
        p_reason: 'Bloqueio reportado manualmente pelo corretor.',
      });
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('webjs-report-block error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
