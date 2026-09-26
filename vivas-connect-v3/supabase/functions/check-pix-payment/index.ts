// ============================================================================
// check-pix-payment
// ----------------------------------------------------------------------------
// Verificacao manual sob demanda ("Ja paguei"), pedida pelo dono pra cobrir o
// caso do webhook do Mercado Pago atrasar ou nao chegar. NAO confia em nada
// vindo do cliente: busca o pending_payment_id da propria org no banco e
// confere o status direto na API do MP (mesma logica do mercadopago-webhook,
// reaplicada aqui pra nao depender do webhook ter disparado).
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

const MP_API_BASE = 'https://api.mercadopago.com';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });

  try {
    const caller = await requireOrgCaller(req);
    const admin = getAdminClient();

    const { data: sub, error: subErr } = await admin
      .schema('whatsapp_hub')
      .from('subscriptions')
      .select('org_id, status, current_period_end, pending_payment_id')
      .eq('org_id', caller.orgId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) {
      return jsonResponse({ ok: false, error: 'Esta organizacao nao tem cobranca configurada.' }, { status: 404 });
    }

    // Ja esta ativo (webhook ja processou antes de clicar) — nada a fazer.
    if (sub.status === 'active') {
      return jsonResponse({ ok: true, status: 'active' });
    }
    if (!sub.pending_payment_id) {
      return jsonResponse({ ok: true, status: sub.status, error: 'Nenhum pagamento pendente encontrado.' });
    }

    const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      return jsonResponse({ ok: false, error: 'Mercado Pago ainda nao configurado nesta instancia.' }, { status: 503 });
    }

    const mpRes = await fetch(`${MP_API_BASE}/v1/payments/${sub.pending_payment_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mpRes.ok) {
      console.error('check-pix-payment: falha ao consultar pagamento', sub.pending_payment_id, mpRes.status);
      return jsonResponse({ ok: true, status: sub.status, error: 'Nao foi possivel confirmar agora. Tente novamente em instantes.' });
    }
    const payment = await mpRes.json();
    const mpStatus: string = payment?.status ?? 'unknown';
    const amountCents = Math.round((payment?.transaction_amount ?? 0) * 100);

    // Ledger idempotente — mesmo padrao do mercadopago-webhook: so estende o
    // periodo se esse mp_payment_id ainda nao tinha sido marcado approved.
    const { data: existing } = await admin
      .schema('whatsapp_hub')
      .from('subscription_payments')
      .select('status')
      .eq('mp_payment_id', String(sub.pending_payment_id))
      .maybeSingle();

    await admin
      .schema('whatsapp_hub')
      .from('subscription_payments')
      .upsert(
        {
          org_id: caller.orgId,
          mp_payment_id: String(sub.pending_payment_id),
          amount_cents: amountCents,
          status: mpStatus,
          paid_at: mpStatus === 'approved' ? new Date().toISOString() : null,
        },
        { onConflict: 'mp_payment_id' },
      );

    if (mpStatus === 'approved' && existing?.status !== 'approved') {
      const base =
        sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()
          ? new Date(sub.current_period_end)
          : new Date();
      const newPeriodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

      await admin
        .schema('whatsapp_hub')
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_end: newPeriodEnd.toISOString(),
          grace_period_end: null,
          pending_payment_id: null,
          pending_qr_base64: null,
          pending_pix_copy_paste: null,
          pending_created_at: null,
        })
        .eq('org_id', caller.orgId);

      return jsonResponse({ ok: true, status: 'active' });
    }

    return jsonResponse({
      ok: true,
      status: sub.status,
      mp_status: mpStatus,
      error: mpStatus === 'pending' || mpStatus === 'in_process'
        ? 'Ainda nao identificamos o pagamento. Aguarde alguns instantes apos pagar e tente de novo.'
        : `Pagamento com status "${mpStatus}" no Mercado Pago.`,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('check-pix-payment error', err);
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : 'Erro interno' }, { status: 500 });
  }
});
