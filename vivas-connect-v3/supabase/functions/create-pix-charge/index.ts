// ============================================================================
// create-pix-charge
// ----------------------------------------------------------------------------
// Gera (ou reaproveita) uma cobranca PIX no Mercado Pago para a org do caller.
// Nao usa o produto "Assinatura" do MP (orientado a cartao) — cada ciclo e um
// pagamento avulso via Pix, seguindo o modelo escolhido: sem debito automatico,
// o cliente escaneia o QR todo ciclo. O webhook (mercadopago-webhook) confirma
// o pagamento e estende current_period_end em 30 dias.
//
// MERCADOPAGO_ACCESS_TOKEN e um segredo DA PLATAFORMA (uma conta MP recebe de
// todas as orgs), nao por-org como Zernio/OpenAI — por isso vem de
// Deno.env, nao de org_settings.
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { isPlanId, priceCentsForPlan } from '../_shared/plans.ts';

const MP_API_BASE = 'https://api.mercadopago.com';
const REUSE_WINDOW_MS = 30 * 60 * 1000; // nao gera 2 QR em 30min se ja tem um pendente

interface Subscription {
  org_id: string;
  status: string;
  plan: string | null;
  plan_price_cents: number;
  current_period_end: string | null;
  pending_payment_id: string | null;
  pending_qr_base64: string | null;
  pending_pix_copy_paste: string | null;
  pending_created_at: string | null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });

  try {
    const caller = await requireOrgCaller(req);
    const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) {
      return jsonResponse(
        { ok: false, error: 'Mercado Pago ainda nao configurado nesta instancia.' },
        { status: 503 },
      );
    }

    const admin = getAdminClient();
    const { data: sub, error: subErr } = await admin
      .schema('whatsapp_hub')
      .from('subscriptions')
      .select(
        'org_id, status, plan, plan_price_cents, current_period_end, pending_payment_id, pending_qr_base64, pending_pix_copy_paste, pending_created_at',
      )
      .eq('org_id', caller.orgId)
      .maybeSingle<Subscription>();
    if (subErr) throw subErr;
    if (!sub) {
      return jsonResponse(
        { ok: false, error: 'Esta organizacao nao tem cobranca configurada.' },
        { status: 404 },
      );
    }

    // Plano escolhido na tela (Bot/Jarvis) — resolve o preço SEMPRE aqui no
    // servidor (nunca confia num amount vindo do cliente). Se a org troca de
    // plano, o preço muda e precisa gerar um QR novo mesmo dentro da janela
    // de reaproveitamento (senão cobraria o valor do plano antigo).
    let body: { plan?: unknown; coupon?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      /* corpo vazio (ex.: renovação, sem troca de plano) — ok */
    }
    const planChanged = isPlanId(body.plan) && body.plan !== sub.plan;
    if (planChanged) {
      const newPriceCents = priceCentsForPlan(body.plan as 'bot' | 'jarvis');
      const { error: planErr } = await admin
        .schema('whatsapp_hub')
        .from('subscriptions')
        .update({ plan: body.plan, plan_price_cents: newPriceCents })
        .eq('org_id', caller.orgId);
      if (planErr) throw planErr;
      sub.plan = body.plan as string;
      sub.plan_price_cents = newPriceCents;
    }

    // Cupom (opcional) — desconto aplicado SÓ nesta cobrança (nunca grava em
    // subscriptions.plan_price_cents, que é o preço recorrente do ciclo
    // seguinte). Validado sempre no servidor: nunca confia num valor com
    // desconto já aplicado vindo do cliente.
    let finalAmountCents = sub.plan_price_cents;
    let couponId: string | null = null;
    const couponCode = typeof body.coupon === 'string' ? body.coupon.trim().toUpperCase() : '';
    if (couponCode) {
      const { data: couponRow } = await admin
        .schema('whatsapp_hub')
        .from('coupons')
        .select('id, discount_type, discount_value, active, expires_at')
        .eq('code', couponCode)
        .maybeSingle();
      if (!couponRow) {
        return jsonResponse({ ok: false, error: 'Cupom não encontrado.' }, { status: 404 });
      }
      if (!couponRow.active || (couponRow.expires_at && new Date(couponRow.expires_at).getTime() < Date.now())) {
        return jsonResponse({ ok: false, error: 'Cupom inválido ou expirado.' }, { status: 400 });
      }
      couponId = couponRow.id as string;
      const discount =
        couponRow.discount_type === 'percent'
          ? Math.round((sub.plan_price_cents * (couponRow.discount_value as number)) / 100)
          : (couponRow.discount_value as number);
      finalAmountCents = Math.max(100, sub.plan_price_cents - discount); // nunca cobra abaixo de R$1
    }

    // Reaproveita o QR pendente se foi gerado ha pouco tempo (evita spamar a
    // API do MP a cada refresh de tela e evita 2 cobrancas abertas juntas) —
    // exceto se o plano mudou ou tem cupom novo, aí o QR antigo tem o valor errado.
    if (
      !planChanged &&
      !couponCode &&
      sub.pending_payment_id &&
      sub.pending_qr_base64 &&
      sub.pending_created_at &&
      Date.now() - new Date(sub.pending_created_at).getTime() < REUSE_WINDOW_MS
    ) {
      return jsonResponse({
        ok: true,
        payment_id: sub.pending_payment_id,
        qr_code_base64: sub.pending_qr_base64,
        pix_copy_paste: sub.pending_pix_copy_paste,
        amount_cents: sub.plan_price_cents,
      });
    }

    const idempotencyKey = crypto.randomUUID();
    const amount = finalAmountCents / 100;

    const mpRes = await fetch(`${MP_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        payment_method_id: 'pix',
        description: 'Vivas Connect - assinatura mensal',
        external_reference: caller.orgId,
        payer: { email: caller.email ?? `org-${caller.orgId}@vivas.local` },
      }),
    });

    const mpBody = await mpRes.json();
    if (!mpRes.ok) {
      console.error('mercadopago create payment error', mpRes.status, mpBody);
      return jsonResponse(
        { ok: false, error: mpBody?.message ?? 'Falha ao gerar cobranca no Mercado Pago.' },
        { status: 502 },
      );
    }

    const qrBase64 = mpBody?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
    const qrCopyPaste = mpBody?.point_of_interaction?.transaction_data?.qr_code ?? null;
    const paymentId = String(mpBody?.id ?? '');

    const { error: updErr } = await admin
      .schema('whatsapp_hub')
      .from('subscriptions')
      .update({
        pending_payment_id: paymentId,
        pending_qr_base64: qrBase64,
        pending_pix_copy_paste: qrCopyPaste,
        pending_created_at: new Date().toISOString(),
      })
      .eq('org_id', caller.orgId);
    if (updErr) throw updErr;

    await admin.schema('whatsapp_hub').from('subscription_payments').insert({
      org_id: caller.orgId,
      mp_payment_id: paymentId,
      amount_cents: finalAmountCents,
      status: 'pending',
      coupon_id: couponId,
    });

    return jsonResponse({
      ok: true,
      payment_id: paymentId,
      qr_code_base64: qrBase64,
      pix_copy_paste: qrCopyPaste,
      amount_cents: finalAmountCents,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('create-pix-charge error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
