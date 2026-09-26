import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, GraduationCap, Loader2, Minus, X } from 'lucide-react';
import { PlanPicker } from '@/components/billing/PlanPicker';
import { PaymentPanel } from '@/app/components/billing/SubscriptionGate';
import { useSubscription } from '@/hooks/useSubscription';
import { getPlan, formatBRL, PLAN_COMPARISON, type PlanId } from '@/lib/plans';

// ----------------------------------------------------------------------------
// PlansPage — página própria pra ver/trocar de plano (pedido do dono,
// 2026-08-31: "quando eu clicar em planos abra uma página só disso, com a
// setinha de voltar" — antes era um diálogo apertado (PlansDialog), e a
// versão embutida em Configurações > Assinatura também ficava espremida
// dentro de um Card). As duas telas antigas agora só levam pra cá, evitando
// ter 2 versões divergentes do mesmo fluxo de troca de plano.
//
// 2026-09-06: mesmo já sendo uma página própria com seta de voltar, ainda
// abria DENTRO do AppLayout — sidebar/header apareciam em volta mesmo assim
// ("eu quero que a tela inteira seja tudo apenas sobre os planos"). Rota
// movida em router.tsx pra fora do grupo do AppLayout; esta página agora
// monta o próprio fundo/padding de tela cheia (antes vinha de graça do
// <main> do AppLayout).
//
// Abaixo dos cards (já existentes, PlanPicker/PlanCard), uma tabela
// comparativa linha a linha com TODAS as informações de cada plano — pedido
// explícito ("eu quero todas as informações de cada um"). Os números vêm de
// PLAN_COMPARISON (src/lib/plans.ts), que precisa bater com o que o código
// realmente aplica (webjs-worker/campaignWorker.js, useDispatchSettings.ts).
// ----------------------------------------------------------------------------

export default function PlansPage() {
  const navigate = useNavigate();
  const { subscription, loading, refresh } = useSubscription();
  const [targetPlan, setTargetPlan] = useState<PlanId | null>(null);

  return (
    <div className="min-h-screen p-4 sm:p-6 sm:py-10">
    <div className="max-w-5xl mx-auto space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--accent-primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <header>
        <h1 className="text-2xl font-bold text-display">Planos</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Compare o Bot e o Jarvis e escolha o que faz sentido pra você agora — dá pra trocar quando quiser.
        </p>
      </header>

      {/* Destaque do Professor Resposta — pedido do dono (2026-09-11):
          ferramenta nova, incluída nos DOIS planos sem custo extra, mereceu
          bloco próprio em vez de só um item a mais na lista de recursos. */}
      <div className="glass-card flex flex-col sm:flex-row items-start gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)]">
          <GraduationCap className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Novidade: Professor Resposta</h2>
            <span className="rounded-full bg-[rgba(var(--accent-primary-rgb),0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-primary)]">
              Incluso nos dois planos
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)] max-w-[62ch]">
            Um mentor de vendas dentro da aba Ferramentas. Você cola o rascunho da mensagem, ele reescreve com
            técnica de persuasão de verdade (Cialdini, Kahneman, Chris Voss) e explica o porquê de cada troca —
            até 20 vezes por dia, sem custo adicional, em qualquer plano.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : !subscription ? (
        <div className="glass-card p-8 text-center text-sm text-[var(--color-text-secondary)]">
          Esta organização não tem cobrança configurada.
        </div>
      ) : targetPlan ? (
        <div className="glass-card mx-auto max-w-md space-y-4 p-8 text-center">
          <h3 className="text-base font-bold">
            Pague o Pix para confirmar a troca pro {getPlan(targetPlan).name}
          </h3>
          <PaymentPanel currentPlan={targetPlan} onPaid={() => void refresh()} />
          <button
            type="button"
            onClick={() => setTargetPlan(null)}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
          >
            Voltar pros planos
          </button>
        </div>
      ) : (
        <>
          {subscription.plan && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Seu plano atual: <span className="font-semibold text-[var(--color-text-primary)]">{getPlan(subscription.plan).name}</span>
              {' '}({formatBRL(subscription.plan_price_cents)}/mês)
            </p>
          )}

          <PlanPicker currentPlan={subscription.plan} onSelect={setTargetPlan} />

          {/* Celular (<md): cada linha vira um card empilhado — a tabela de
              verdade abaixo exige rolar de lado numa tela estreita, o que o
              dono reportou como "ruim de analisar" no celular. */}
          <div className="md:hidden space-y-3">
            {PLAN_COMPARISON.map((row) => (
              <div key={row.label} className="glass-card space-y-2 p-4">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{row.label}</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-label">Bot</div>
                    <ComparisonValue value={row.bot} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-label">Jarvis</div>
                    <ComparisonValue value={row.jarvis} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop (md+): tabela de verdade. */}
          <div className="hidden md:block glass-card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(var(--accent-secondary-rgb),0.12)] text-left">
                  <th className="p-4 text-label">Recurso</th>
                  <th className="p-4 text-label">Bot</th>
                  <th className="p-4 text-label">Jarvis</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-[rgba(var(--accent-secondary-rgb),0.06)] last:border-b-0">
                    <td className="p-4 font-medium text-[var(--color-text-primary)]">{row.label}</td>
                    <ComparisonCell value={row.bot} />
                    <ComparisonCell value={row.jarvis} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

// "Sim"/"Não" viram ícone (leitura mais rápida de cima a baixo), qualquer
// outro texto (número, explicação curta) aparece como está. Usado tanto na
// tabela (desktop, embrulhado num <td> por ComparisonCell) quanto nos cards
// empilhados do celular (ComparisonValue sozinho, sem <td>).
function ComparisonValue({ value }: { value: string }) {
  if (value === 'Sim') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--color-success)]">
        <Check className="h-4 w-4" /> Sim
      </span>
    );
  }
  if (value === 'Não') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)] opacity-60">
        <X className="h-4 w-4" /> Não
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1.5 text-[var(--color-text-primary)]">
      <Minus className="mt-1 h-3 w-3 shrink-0 opacity-40" />
      {value}
    </span>
  );
}

function ComparisonCell({ value }: { value: string }) {
  return (
    <td className="p-4">
      <ComparisonValue value={value} />
    </td>
  );
}
