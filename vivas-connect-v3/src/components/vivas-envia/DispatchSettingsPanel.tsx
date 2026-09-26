import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Gauge, Scale, Rocket, Sliders, Loader2, Save, Clock, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  useDispatchSettings,
  SAFE_PRESET,
  MODERATE_PRESET,
  RISKY_PRESET,
  computeAutoDelays,
  computeSecurityScore,
  scoreReason,
  estimateSecondsPerMessage,
  formatEtaForCount,
  type DispatchSettings,
} from '@/hooks/useDispatchSettings';

// ----------------------------------------------------------------------------
// DispatchSettingsPanel — pedido do dono (2026-08-27, 3ª rodada de feedback):
// 1) o bug do destaque das abas Seguro/Arriscado travando quando o manual
//    tava ativo (a causa: o destaque era calculado a partir de `mode`, que
//    virava sempre 'manual' — agora é calculado a partir do daily_limit,
//    que é o que realmente muda);
// 2) 220/dia como preset "Moderado", meio-termo entre 150 e 250;
// 3) o campo manual tem que aceitar QUALQUER número livremente (antes
//    clampava a cada tecla digitada, travando o campo no meio da digitação
//    — clamp só acontece agora no momento de salvar);
// 4) explicar o PORQUÊ da nota de proteção, não só o número.
//
// 2026-09-04 (pedido do dono): a caixa "Como vai funcionar" mostrava os
// delays calculados em segundos/minutos, camada por camada — removida.
// O motor anti-bloqueio é tecnologia proprietária do VIVAS e os detalhes de
// como o envio é feito não ficam expostos na UI (ver AntiBlockGuide.tsx).
// ----------------------------------------------------------------------------

const MIN_DAILY = 10;
const MAX_DAILY = 300;

function scoreColor(score: number): string {
  if (score >= 8) return 'var(--color-success)';
  if (score >= 5) return '#FBBF24';
  return 'var(--color-error)';
}

function scoreLabel(score: number): string {
  if (score >= 8) return 'Proteção alta';
  if (score >= 5) return 'Proteção média';
  return 'Proteção baixa';
}

// Mensagem genérica no lugar dos delays calculados — pedido do dono
// (2026-09-04): não expor em segundos/minutos como o motor anti-bloqueio
// pausa entre mensagens. Continua reforçando que a proteção está ativa pro
// ritmo escolhido, sem detalhar o mecanismo.
function explainDelays(_cfg: DispatchSettings): string {
  return 'Nosso sistema anti-bloqueio proprietário ajusta tudo automaticamente pra esse ritmo — os detalhes de como o envio é feito são tecnologia exclusiva do VIVAS.';
}

export function DispatchSettingsPanel() {
  const { settings, loading, saving, save } = useDispatchSettings();
  const [draft, setDraft] = useState<DispatchSettings>(SAFE_PRESET);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    setDraft(settings);
    setManualOpen(settings.mode === 'manual');
  }, [loading, settings]);

  // Destaque das abas: baseado no daily_limit ATUAL, não no `mode` — assim
  // continua funcionando mesmo com o manual aberto (bug relatado pelo dono).
  const baseSelected: 'safe' | 'moderate' | 'risky' | null =
    draft.daily_limit === SAFE_PRESET.daily_limit
      ? 'safe'
      : draft.daily_limit === MODERATE_PRESET.daily_limit
        ? 'moderate'
        : draft.daily_limit === RISKY_PRESET.daily_limit
          ? 'risky'
          : null;

  const applyPreset = (preset: DispatchSettings) => {
    setDraft(manualOpen ? { ...preset, mode: 'manual' } : preset);
  };

  const toggleManual = (open: boolean) => {
    setManualOpen(open);
    setDraft((cur) => ({ ...cur, mode: open ? 'manual' : (baseSelected ?? 'safe') }));
  };

  // Sem clamp em tempo real — o campo fica livre pra digitar qualquer coisa
  // (pedido do dono). Só valida no momento de salvar (handleSave).
  const setManualDailyLimit = (raw: string) => {
    const parsed = raw === '' ? 0 : Number(raw);
    const dailyLimit = Number.isFinite(parsed) ? parsed : 0;
    setDraft({ mode: 'manual', daily_limit: dailyLimit, ...computeAutoDelays(dailyLimit) });
  };

  const dirty = useMemo(() => {
    if (draft.mode !== settings.mode) return true;
    return JSON.stringify(draft) !== JSON.stringify(settings);
  }, [draft, settings]);

  const outOfRange = manualOpen && (draft.daily_limit < MIN_DAILY || draft.daily_limit > MAX_DAILY);

  const score = useMemo(() => computeSecurityScore(draft.daily_limit), [draft.daily_limit]);
  const reason = useMemo(() => scoreReason(draft.daily_limit, score), [draft.daily_limit, score]);
  const etaFor100 = useMemo(() => formatEtaForCount(draft, 100), [draft]);
  const avgSecondsPerMsg = useMemo(() => estimateSecondsPerMessage(draft), [draft]);
  const delayExplanation = useMemo(() => explainDelays(draft), [draft]);

  const handleSave = async () => {
    if (outOfRange) {
      toast.error(`Escolha um número entre ${MIN_DAILY} e ${MAX_DAILY} mensagens por dia.`);
      return;
    }
    const ok = await save(draft);
    if (ok) toast.success('Configuração de disparo salva.');
    else toast.error('Não foi possível salvar. Tente de novo.');
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configuração de disparo...
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-5">
        <header>
          <h3 className="text-sm font-bold">Ritmo de disparo</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Escolha o ritmo — calculamos os delays automaticamente pra ele.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => applyPreset(SAFE_PRESET)}
            className={cn(
              'text-left rounded-lg border p-4 transition-colors',
              baseSelected === 'safe'
                ? 'border-[var(--color-success)] bg-[rgba(16,185,129,0.06)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] hover:border-[rgba(var(--accent-secondary-rgb),0.3)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-[var(--color-success)]" />
                <span className="text-sm font-semibold">Seguro</span>
              </div>
              <ScorePill score={computeSecurityScore(SAFE_PRESET.daily_limit)} />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
              Até <strong>150 mensagens/dia</strong>. Recomendado — o ritmo mais testado.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset(MODERATE_PRESET)}
            className={cn(
              'text-left rounded-lg border p-4 transition-colors',
              baseSelected === 'moderate'
                ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.08)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] hover:border-[rgba(var(--accent-secondary-rgb),0.3)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-semibold">Moderado</span>
              </div>
              <ScorePill score={computeSecurityScore(MODERATE_PRESET.daily_limit)} />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
              Até <strong>220 mensagens/dia</strong>. Meio-termo entre volume e segurança.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyPreset(RISKY_PRESET)}
            className={cn(
              'text-left rounded-lg border p-4 transition-colors',
              baseSelected === 'risky'
                ? 'border-[#FBBF24] bg-[rgba(251,191,36,0.06)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] hover:border-[rgba(var(--accent-secondary-rgb),0.3)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-[#FBBF24]" />
                <span className="text-sm font-semibold">Arriscado</span>
              </div>
              <ScorePill score={computeSecurityScore(RISKY_PRESET.daily_limit)} />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
              Até <strong>250 mensagens/dia</strong>. Mais volume, mais rápido.
            </p>
          </button>
        </div>

        <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={manualOpen}
            onChange={(e) => toggleManual(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent-primary)]"
          />
          <Sliders className="h-4 w-4 text-[var(--color-text-secondary)]" />
          Quer escolher o número exato de mensagens por dia?
        </label>

        {manualOpen && (
          <div className="space-y-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.02] p-4">
            <Label>Quantas mensagens por dia?</Label>
            <Input
              type="number"
              value={draft.daily_limit === 0 ? '' : draft.daily_limit}
              onChange={(e) => setManualDailyLimit(e.target.value)}
              placeholder="Ex.: 220"
            />
            {outOfRange ? (
              <p className="text-[11px] text-[var(--color-error)]">
                Escolha um número entre {MIN_DAILY} e {MAX_DAILY}.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--color-text-secondary)] opacity-80">
                Digite qualquer número — calculamos os delays automaticamente pra ele.
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] px-4 py-3">
          <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">Como vai funcionar</p>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{delayExplanation}</p>
        </div>

        <div
          className="flex items-start gap-3 rounded-lg border px-4 py-3"
          style={{ borderColor: `${scoreColor(score)}4D`, background: `${scoreColor(score)}0F` }}
        >
          <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: scoreColor(score) }} />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: scoreColor(score) }}>
                {score}/10
              </span>
              <span className="text-sm font-semibold" style={{ color: scoreColor(score) }}>
                {scoreLabel(score)}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{reason}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-[rgba(var(--accent-secondary-rgb),0.04)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>
              <strong>{avgSecondsPerMsg.toFixed(0)}s</strong> por mensagem em média — 100 contatos
              levam <strong>{etaFor100}</strong>.
            </span>
          </div>
          <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ color: scoreColor(score), background: `${scoreColor(score)}1A` }}
    >
      {score}/10
    </span>
  );
}
