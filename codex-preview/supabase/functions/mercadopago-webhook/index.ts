// ============================================================================
// mercadopago-webhook
// ----------------------------------------------------------------------------
// Recebe a notificacao do Mercado Pago (pagamento criado/atualizado). NUNCA
// confia no corpo do webhook para decidir se foi pago — sempre busca o
// pagamento de volta na API do MP pelo id, usando nosso proprio token. Isso
// torna irrelevante se o payload em si pode ser forjado: um POST falso so
// resulta numa consulta real ao MP, que devolve o status real.
//
// Idempotente via subscription_payments.mp_payment_id (UNIQUE) — reprocessar
// a mesma notificacao (o MP reenvia em retry) nao duplica nem re-estende o
// periodo.
// ============================================================================

import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

const MP_API_BASE = 'https://api.mercadopago.com';

function extractPaymentId(url: URL, body: unknown): string | null {
  const fromQuery = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const data = b.data as Record<string, unknown> | undefined;
    if (data && typeof data.id === 'string') return data.id;
    if (data && typeof data.id === 'number') return String(data.id);
  }
  return null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // Sempre 200 rapido (exceto erro de configuracao) — o MP re-tenta agressivo
  // em qualquer outro codigo, e notificacao de tipo desconhecido nao e erro.
  try {
    const url = new URL(req.url);
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      // corpo vazio (ping) ou nao-JSON — segue só com query params
    }

    const paymentId = extractPaymentId(url, body);
    if (!paymentId) {
      return jsonResponse({ ok: true, ignored: true }, { status: 200 });
    }

    const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      console.error('mercadopago-webhook: MERCADOPAGO_ACCESS_TOKEN ausente');
      return jsonResponse({ ok: false, error: 'not configured' }, { status: 200 });
    }

    const mpRes = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mpRes.ok) {
      console.error('mercadopago-webhook: falha ao buscar pagamento', paymentId, mpRes.status);
      return jsonResponse({ ok: true, ignored: true }, { status: 200 });
    }
    const payment = await mpRes.json();

    const orgId: string | null = payment?.external_reference ?? null;
    const status: string = payment?.status ?? 'unknown';
    const amountCents = Math.round((payment?.transaction_amount ?? 0) * 100);

    if (!orgId) {
      return jsonResponse({ ok: true, ignored: true }, { status: 200 });
    }

    const admin = getAdminClient();

    // Ledger idempotente: se ja processamos esse mp_payment_id com o mesmo
    // status, nao repete o efeito colateral de estender o periodo.
    const { data: existing } = await admin
      .schema('whatsapp_hub')
      .from('subscription_payments')
      .select('status')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle();

    await admin
      .schema('whatsapp_hub')
      .from('subscription_payments')
      .upsert(
        {
          org_id: orgId,
          mp_payment_id: String(paymentId),
          amount_cents: amountCents,
          status,
          paid_at: status === 'approved' ? new Date().toISOString() : null,
        },
        { onConflict: 'mp_payment_id' },
      );

    if (status === 'approved' && existing?.status !== 'approved') {
      const { data: sub } = await admin
        .schema('whatsapp_hub')
        .from('subscriptions')
        .select('current_period_end')
        .eq('org_id', orgId)
        .maybeSingle();

      const base =
        sub?.current_period_end && new Date(sub.current_period_end).getTime() > Date.now()
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
        .eq('org_id', orgId);
    }

    return jsonResponse({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('mercadopago-webhook error', err);
    // 200 mesmo em erro interno pra nao entrar num loop de retry do MP;
    // o erro fica logado pra investigar.
    return jsonResponse({ ok: false }, { status: 200 });
  }
});
