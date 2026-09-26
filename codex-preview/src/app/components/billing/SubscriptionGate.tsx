import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Loader2, LogOut, QrCode, Tag } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { RobotLoader } from '@/components/ui/RobotLoader';
import { Dialog } from '@/components/ui/dialog';
import { PlanPicker } from '@/components/billing/PlanPicker';
import { getPlan, activePriceCents, type PlanId } from '@/lib/plans';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import { useAppUser } from '@/app/providers/AppUserProvider';
import {
  useSubscription,
  daysUntil,
  type SubscriptionRow,
  type SubscriptionStatus,
} from '@/hooks/useSubscription';

gsap.registerPlugin(useGSAP);

// ----------------------------------------------------------------------------
// SubscriptionGate — bloqueio/aviso de cobranca (VIVAS billing, PIX manual).
// ----------------------------------------------------------------------------
// pending_first_payment | blocked -> tela cheia, sem acesso ao app.
// grace_period -> acesso liberado + banner fixo com "Pagar agora".
// active a <=2 dias do vencimento -> banner informativo (sem bloquear).
// Sem linha em subscriptions -> org isenta do gate (nao renderiza nada).
// ----------------------------------------------------------------------------

// supabase.functions.invoke zera `data` em respostas nao-2xx; le o corpo da
// resposta pra mostrar a mensagem real da funcao (mesmo padrao de TeamSettings).
async function invokeErrorMessage(error: unknown, data: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* corpo nao-JSON */
    }
  }
  return (error as { message?: string } | null)?.message ?? 'Erro desconhecido';
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface PixData {
  qr_code_base64: string | null;
  pix_copy_paste: string | null;
  amount_cents: number;
}

// 'plan' e 'switch' vem ANTES do fluxo de cupom — pedido do dono, 2026-09-22:
// "na hora de eu pagar o plano eu quero poder escolher qual que eu vou
// querar vai que eu quero trocar". Antes disso, uma renovação sempre cobrava
// de novo o mesmo plano salvo, sem chance de trocar no momento do pagamento.
type PaymentStep = 'plan' | 'switch' | 'ask' | 'input' | 'resolved';

// Checkmark animado (GSAP) mostrado dentro do próprio modal assim que o
// pagamento é detectado — pedido do dono, 2026-09-22: "gere uma mensagem
// pagamento concluído e quero uma animação legal". Usa pathLength=1 no SVG
// pra animar o traço do check sem depender de plugin pago do GSAP
// (DrawSVG). Respeita prefers-reduced-motion, mesmo padrão do StatusPulse.
function PaymentSuccessCheck() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGPathElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline();
      tl.fromTo(wrapRef.current, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      tl.fromTo(
        circleRef.current,
        { scale: 0, transformOrigin: '50% 50%' },
        { scale: 1, duration: 0.4, ease: 'back.out(2.5)' },
        '-=0.05',
      );
      tl.fromTo(checkRef.current, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, '-=0.1');
      return () => tl.kill();
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-3 py-8">
      <svg viewBox="0 0 52 52" className="h-20 w-20">
        <circle ref={circleRef} cx="26" cy="26" r="23" fill="none" stroke="var(--color-success)" strokeWidth="3" />
        <path
          ref={checkRef}
          d="M15 27l7 7 15-15"
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1 }}
        />
      </svg>
      <div className="text-center">
        <p className="text-lg font-bold text-[var(--color-success)]">Pagamento confirmado!</p>
        <p className="text-sm text-[var(--color-text-secondary)]">Seu acesso já foi renovado.</p>
      </div>
    </div>
  );
}

export function PaymentPanel({ currentPlan, onPaid }: { currentPlan: PlanId; onPaid: () => void }) {
  const { orgId } = useAppUser();
  // Plano que vai ser efetivamente cobrado — começa no plano atual da org,
  // mas a pessoa pode trocar antes de gerar o QR (ver step 'switch').
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(currentPlan);

  // Pergunta sobre cupom ANTES de gerar o QR (pedido do dono) — só chama
  // create-pix-charge depois que a pessoa disse "não tenho" ou aplicou um
  // código válido. Evita gerar uma cobrança de valor cheio à toa.
  const [step, setStep] = useState<PaymentStep>('plan');
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const [pix, setPix] = useState<PixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [checkingNow, setCheckingNow] = useState(false);

  const fetchPix = useCallback(
    async (coupon?: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      const supabase = getSupabase();
      // Sempre manda o plano explicitamente (nunca deixa o servidor decidir
      // sozinho) — é assim que a troca de plano feita no step 'switch' chega
      // no create-pix-charge.
      const body: Record<string, string> = { plan: selectedPlan };
      if (coupon) body.coupon = coupon;
      const { data, error: fnError } = await supabase.functions.invoke('create-pix-charge', { body });
      setLoading(false);
      if (fnError || !data?.ok) {
        setError(await invokeErrorMessage(fnError, data));
        return false;
      }
      setPix(data);
      return true;
    },
    [selectedPlan],
  );

  const continueWithoutCoupon = async () => {
    setStep('resolved');
    await fetchPix();
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponError(null);
    setLoading(true);
    const ok = await fetchPix(code);
    setLoading(false);
    if (!ok) {
      // Erro específico do cupom fica aqui (não troca de tela) — a pessoa
      // pode corrigir o código sem perder o fluxo. Erros de outra natureza
      // (Mercado Pago fora do ar, etc.) também aparecem aqui por ora.
      setCouponError(error);
      return;
    }
    setAppliedCoupon(code);
    setStep('resolved');
  };

  // Enquanto o QR estiver na tela, confere a cada 5s (consulta direta, só
  // pra esta tela) se o pagamento já caiu (o webhook do Mercado Pago
  // atualiza subscriptions em segundo plano). Ao detectar, primeiro mostra
  // a animação de sucesso AQUI DENTRO; só avisa o resto do app (onPaid) alguns
  // segundos depois — senão o banner/tela de bloqueio some no meio da
  // animação, antes da pessoa ver a confirmação (pedido do dono, 2026-09-22).
  useEffect(() => {
    if (step !== 'resolved' || !pix || paymentConfirmed || !orgId) return;
    const interval = setInterval(async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .schema('whatsapp_hub')
        .from('subscriptions')
        .select('status')
        .eq('org_id', orgId)
        .maybeSingle();
      if ((data as { status?: SubscriptionStatus } | null)?.status === 'active') {
        setPaymentConfirmed(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, pix, paymentConfirmed, orgId]);

  useEffect(() => {
    if (!paymentConfirmed) return;
    const timer = window.setTimeout(() => onPaid(), 2600);
    return () => window.clearTimeout(timer);
  }, [paymentConfirmed, onPaid]);

  // Botão "Já paguei" — pedido do dono, 2026-09-22: em vez de só esperar o
  // poll de 5s ou o webhook do Mercado Pago, a pessoa pode forçar a
  // verificação na hora. Chama check-pix-payment, que confere o status do
  // pagamento direto na API do MP (não confia só no que já está salvo).
  const handleCheckNow = async () => {
    setCheckingNow(true);
    const supabase = getSupabase();
    const { data, error: fnError } = await supabase.functions.invoke('check-pix-payment', { body: {} });
    setCheckingNow(false);
    if (fnError || !data?.ok) {
      toast.error(await invokeErrorMessage(fnError, data));
      return;
    }
    if (data.status === 'active') {
      setPaymentConfirmed(true);
      return;
    }
    toast.info(data.error ?? 'Ainda não identificamos o pagamento. Tente novamente em instantes.');
  };

  if (paymentConfirmed) {
    return <PaymentSuccessCheck />;
  }

  if (step === 'plan') {
    const planDef = getPlan(selectedPlan);
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Você está pagando o:</p>
        <div>
          <p className="text-lg font-bold text-display">{planDef.name}</p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {formatBRL(activePriceCents(planDef))}/mês
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => setStep('switch')}>
            Trocar plano
          </Button>
          <Button type="button" onClick={() => setStep('ask')}>
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'switch') {
    return (
      <div className="space-y-4 py-2">
        <PlanPicker
          currentPlan={selectedPlan}
          onSelect={(newPlan) => {
            setSelectedPlan(newPlan);
            setStep('plan');
          }}
        />
        <div className="text-center">
          <button
            type="button"
            onClick={() => setStep('plan')}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (step === 'ask') {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <Tag className="h-4 w-4 text-[var(--accent-primary)]" />
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Você tem um cupom de desconto?
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => void continueWithoutCoupon()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Não tenho'}
          </Button>
          <Button type="button" onClick={() => setStep('input')} disabled={loading}>
            Tenho um cupom
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'input') {
    return (
      <div className="space-y-3 py-4">
        <div className="mx-auto flex w-full max-w-xs items-center gap-2">
          <Input
            autoFocus
            value={couponInput}
            onChange={(e) => {
              setCouponInput(e.target.value);
              setCouponError(null);
            }}
            placeholder="Código do cupom"
            disabled={loading}
            className="text-center uppercase"
          />
        </div>
        {couponError && <p className="text-center text-xs text-[var(--color-error)]">{couponError}</p>}
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => void continueWithoutCoupon()} disabled={loading}>
            Continuar sem cupom
          </Button>
          <Button type="button" onClick={() => void handleApplyCoupon()} disabled={loading || !couponInput.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar e continuar'}
          </Button>
        </div>
      </div>
    );
  }

  // step === 'resolved' — QR/Pix a partir daqui.
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Gerando QR code Pix...
      </div>
    );
  }

  if (error || !pix) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-sm text-[var(--color-error)]">{error ?? 'Nao foi possivel gerar a cobranca.'}</p>
        <Button type="button" variant="outline" onClick={() => void fetchPix(appliedCoupon ?? undefined)}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="text-2xl font-bold text-display">{formatBRL(pix.amount_cents)}</div>

      {appliedCoupon && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
          <Tag className="h-3.5 w-3.5" />
          Cupom {appliedCoupon} aplicado
        </div>
      )}

      {pix.qr_code_base64 ? (
        <img
          src={`data:image/png;base64,${pix.qr_code_base64}`}
          alt="QR Code Pix"
          className="h-56 w-56 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white p-2"
        />
      ) : (
        <div className="h-56 w-56 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] flex items-center justify-center">
          <QrCode className="h-10 w-10 text-[var(--color-text-secondary)]" />
        </div>
      )}

      {pix.pix_copy_paste && (
        <div className="w-full max-w-xs space-y-1.5">
          <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Pix copia e cola
          </div>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={pix.pix_copy_paste}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--color-text-secondary)]"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pix.pix_copy_paste ?? '');
                toast.success('Código Pix copiado.');
              }}
              aria-label="Copiar código Pix"
              title="Copiar código Pix"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-secondary)] text-center max-w-xs">
        Assim que o pagamento for confirmado, o acesso libera automaticamente
        (pode levar alguns segundos).
      </p>

      <Button type="button" variant="outline" size="sm" onClick={() => void handleCheckNow()} disabled={checkingNow}>
        {checkingNow ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando...
          </>
        ) : (
          'Já paguei, verificar agora'
        )}
      </Button>
    </div>
  );
}

function FullScreenPaywall({
  subscription,
  onPaid,
}: {
  subscription: SubscriptionRow;
  onPaid: () => void;
}) {
  const isBlocked = subscription.status === 'blocked';
  const { signOut } = useAuth();
  // Primeiro pagamento e ainda sem plano escolhido -> mostra a "semi janela"
  // com Bot/Jarvis antes de cair no QR. Renovação (blocked) ou quem já
  // escolheu o plano antes (recarregou a página com o Pix ainda pendente)
  // pula direto pro pagamento, no plano já definido.
  const [chosenPlan, setChosenPlan] = useState<PlanId | null>(subscription.plan);
  const needsPlanChoice = !isBlocked && !chosenPlan;

  const handleLogout = async () => {
    await signOut();
    // Sessão nasceu aqui, sem router — recarrega do zero pra cair no /auth/login.
    window.location.href = '/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className={needsPlanChoice ? 'max-w-4xl w-full text-center space-y-4' : 'max-w-sm w-full text-center space-y-4'}>
        <h1 className="text-xl font-bold text-display">
          {isBlocked ? 'Acesso bloqueado' : needsPlanChoice ? 'Escolha seu plano' : 'Ative sua conta'}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {isBlocked
            ? 'O pagamento nao foi confirmado a tempo. Pague o Pix abaixo para liberar o acesso de novo.'
            : needsPlanChoice
              ? 'Escolha o plano que combina com você — dá pra trocar depois em Configurações.'
              : `Pague o Pix abaixo para liberar o ${getPlan(chosenPlan!).name}.`}
        </p>
        {needsPlanChoice ? (
          <PlanPicker onSelect={setChosenPlan} />
        ) : (
          <PaymentPanel currentPlan={chosenPlan ?? 'bot'} onPaid={onPaid} />
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="mx-auto flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair e entrar com outra conta
        </button>
      </Card>
    </div>
  );
}

function InlineBanner({
  subscription,
  onPaid,
}: {
  subscription: SubscriptionRow;
  onPaid: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isGrace = subscription.status === 'grace_period';
  const days = daysUntil(isGrace ? subscription.grace_period_end : subscription.current_period_end);

  return (
    <div
      className={
        isGrace
          ? 'border-b border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-2'
          : 'border-b border-[#FBBF24]/30 bg-[#FBBF24]/10 px-4 py-2'
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-text-primary)]">
          {isGrace
            ? `Pagamento atrasado — ${days != null && days >= 0 ? `${days} dia(s) útil(eis)` : 'hoje'} antes do bloqueio.`
            : `Seu plano vence em ${days ?? '?'} dia(s).`}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>
          Pagar agora
        </Button>
      </div>
      <Dialog
        open={expanded}
        onClose={() => setExpanded(false)}
        title={isGrace ? 'Regularizar pagamento' : 'Renovar assinatura'}
        description="Pague o Pix abaixo para manter seu acesso ativo."
        widthClass="max-w-2xl"
      >
        <PaymentPanel currentPlan={subscription.plan ?? 'bot'} onPaid={onPaid} />
      </Dialog>
    </div>
  );
}

// Faixa verde temporária no topo do layout principal, mostrada por 10s assim
// que o status vira 'active' vindo de qualquer outro (pending_first_payment,
// grace_period, blocked) — o "sinal verde" de confirmação que o dono pediu,
// visível mesmo pra quem não tinha o modal de pagamento aberto no momento.
function PaymentSuccessBanner() {
  return (
    <div className="border-b border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
        <p className="text-sm font-semibold text-[var(--color-success)]">
          Pagamento confirmado — seu acesso foi renovado.
        </p>
      </div>
    </div>
  );
}

export function RequireActiveSubscription({ children }: { children: ReactElement }) {
  const { subscription, loading, refresh } = useSubscription();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Guarda o último status conhecido pra detectar a TRANSIÇÃO pra 'active'
  // (não só "está active agora") — sem isso, todo refresh normal com a
  // conta já ativa acionaria o banner verde à toa.
  const lastStatusRef = useRef<SubscriptionStatus | null | undefined>(undefined);
  useEffect(() => {
    if (subscription !== undefined) lastStatusRef.current = subscription?.status ?? null;
  }, [subscription]);

  const [justPaid, setJustPaid] = useState(false);
  const stableRefresh = useCallback(async () => {
    const previousStatus = lastStatusRef.current;
    const result = await refreshRef.current();
    if (result?.status === 'active' && previousStatus && previousStatus !== 'active') {
      setJustPaid(true);
      window.setTimeout(() => setJustPaid(false), 10_000);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RobotLoader size={48} />
      </div>
    );
  }
  if (!subscription) return children; // sem linha = org isenta do billing

  if (subscription.status === 'pending_first_payment' || subscription.status === 'blocked') {
    return <FullScreenPaywall subscription={subscription} onPaid={stableRefresh} />;
  }

  if (justPaid) {
    return (
      <>
        <PaymentSuccessBanner />
        {children}
      </>
    );
  }

  const daysLeft = daysUntil(subscription.current_period_end);
  const showExpiringBanner =
    subscription.status === 'active' && daysLeft != null && daysLeft <= 2 && daysLeft >= 0;

  if (subscription.status === 'grace_period' || showExpiringBanner) {
    return (
      <>
        <InlineBanner subscription={subscription} onPaid={stableRefresh} />
        {children}
      </>
    );
  }

  return children;
}
