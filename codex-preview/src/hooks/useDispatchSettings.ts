import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

// ----------------------------------------------------------------------------
// useDispatchSettings — lê/grava whatsapp_hub.dispatch_settings (migração
// 20260827120000). Pedido do dono (2026-08-27): em vez de só aplicar sempre
// um limite fixo de 150 msgs/dia, deixar escolher entre "seguro" (150/dia),
// "arriscado" (250/dia, delays mais apertados) ou editar os delays na mão.
// campaignWorker.js lê a mesma tabela — os presets abaixo têm que bater
// EXATAMENTE com os valores que o worker aplica (ver
// webjs-worker/src/campaignWorker.js::DEFAULTS e getDispatchConfig).
// ----------------------------------------------------------------------------

export type DispatchMode = 'safe' | 'moderate' | 'risky' | 'manual';

export interface DispatchSettings {
  mode: DispatchMode;
  daily_limit: number;
  delay_curto_min_seconds: number;
  delay_curto_max_seconds: number;
  delay_medio_a_cada: number;
  delay_medio_min_minutes: number;
  delay_medio_max_minutes: number;
  delay_longo_a_cada: number;
  delay_longo_min_minutes: number;
  delay_longo_max_minutes: number;
}

// Preset "seguro" — idêntico ao DEFAULTS do campaignWorker.js (o
// comportamento de sempre, historicamente testado).
export const SAFE_PRESET: DispatchSettings = {
  mode: 'safe',
  daily_limit: 150,
  delay_curto_min_seconds: 35,
  delay_curto_max_seconds: 80,
  delay_medio_a_cada: 8,
  delay_medio_min_minutes: 4,
  delay_medio_max_minutes: 9,
  delay_longo_a_cada: 30,
  delay_longo_min_minutes: 20,
  delay_longo_max_minutes: 35,
};

// Preset "arriscado" — mais volume (250/dia) com delays mais apertados pra
// caber no mesmo horário comercial (8h-20h). Ainda estruturado nas 3 camadas
// de delay, só que mais rápido — por isso é mais arriscado, não porque
// "ignora" o motor anti-bloqueio.
export const RISKY_PRESET: DispatchSettings = {
  mode: 'risky',
  daily_limit: 250,
  delay_curto_min_seconds: 20,
  delay_curto_max_seconds: 45,
  delay_medio_a_cada: 10,
  delay_medio_min_minutes: 3,
  delay_medio_max_minutes: 6,
  delay_longo_a_cada: 40,
  delay_longo_min_minutes: 15,
  delay_longo_max_minutes: 25,
};

// Calcula os 8 campos de delay automaticamente a partir de só 1 número
// (limite diário) — pedido do dono (2026-08-27): "quando eu colocar o
// número de limite... faça todo o resto do cálculo dos delays". Interpola
// (e extrapola linearmente pra fora do intervalo) entre os presets seguro
// (150/dia) e arriscado (250/dia) — mais mensagens por dia = delays mais
// apertados, sempre nas mesmas 3 camadas.
export function computeAutoDelays(dailyLimit: number): Omit<DispatchSettings, 'mode' | 'daily_limit'> {
  const t = (dailyLimit - SAFE_PRESET.daily_limit) / (RISKY_PRESET.daily_limit - SAFE_PRESET.daily_limit);
  const lerp = (a: number, b: number) => a + t * (b - a);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    delay_curto_min_seconds: Math.max(10, Math.round(lerp(SAFE_PRESET.delay_curto_min_seconds, RISKY_PRESET.delay_curto_min_seconds))),
    delay_curto_max_seconds: Math.max(15, Math.round(lerp(SAFE_PRESET.delay_curto_max_seconds, RISKY_PRESET.delay_curto_max_seconds))),
    delay_medio_a_cada: Math.max(3, Math.round(lerp(SAFE_PRESET.delay_medio_a_cada, RISKY_PRESET.delay_medio_a_cada))),
    delay_medio_min_minutes: Math.max(1, round1(lerp(SAFE_PRESET.delay_medio_min_minutes, RISKY_PRESET.delay_medio_min_minutes))),
    delay_medio_max_minutes: Math.max(1.5, round1(lerp(SAFE_PRESET.delay_medio_max_minutes, RISKY_PRESET.delay_medio_max_minutes))),
    delay_longo_a_cada: Math.max(10, Math.round(lerp(SAFE_PRESET.delay_longo_a_cada, RISKY_PRESET.delay_longo_a_cada))),
    delay_longo_min_minutes: Math.max(5, round1(lerp(SAFE_PRESET.delay_longo_min_minutes, RISKY_PRESET.delay_longo_min_minutes))),
    delay_longo_max_minutes: Math.max(8, round1(lerp(SAFE_PRESET.delay_longo_max_minutes, RISKY_PRESET.delay_longo_max_minutes))),
  };
}

// Preset "moderado" — meio-termo pedido pelo dono (2026-08-27): 220/dia,
// entre o seguro e o arriscado. Números vêm da MESMA fórmula de
// computeAutoDelays (não hardcoded à parte), pra nunca destoar dela.
export const MODERATE_PRESET: DispatchSettings = {
  mode: 'moderate',
  daily_limit: 220,
  ...computeAutoDelays(220),
};

// Nota de proteção 0-10 — pedido do dono: "150 mensagens é level 10 de
// proteção". Cai conforme o limite diário sobe (mais volume = mais
// arriscado), nunca passa de 10 nem de 1 — mesmo no limite máximo (300) o
// sistema ainda tem delay/aquecimento/reply-ratio por baixo, nunca é "sem
// proteção nenhuma".
export function computeSecurityScore(dailyLimit: number): number {
  const raw = 10 - (dailyLimit - SAFE_PRESET.daily_limit) / 20;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

// Explica o PORQUÊ da nota — pedido do dono ("especifique o porquê da
// nota"), não só mostrar o número. Reescrito 2026-09-04 (pedido do dono):
// sem citar mecanismo interno (delay, aquecimento, taxa de resposta) — só o
// resultado, em termos de volume e exposição.
export function scoreReason(dailyLimit: number, score: number): string {
  if (dailyLimit <= SAFE_PRESET.daily_limit) {
    return `Nota máxima: ${dailyLimit} mensagens/dia está no ritmo mais espaçado que oferecemos (ou mais devagar ainda) — o mesmo usado desde o início da plataforma, o mais testado.`;
  }
  const acima = dailyLimit - SAFE_PRESET.daily_limit;
  if (score >= 7) {
    return `${dailyLimit} mensagens/dia é ${acima} a mais que o ritmo seguro (150/dia) — ainda numa faixa confortável, com toda a proteção do sistema ativa.`;
  }
  if (score >= 5) {
    return `${dailyLimit} mensagens/dia é quase o dobro do ritmo seguro — mais volume por dia aumenta naturalmente a exposição do número, mesmo com a proteção ativa.`;
  }
  return `${dailyLimit} mensagens/dia é um volume alto — o mais arriscado que dá pra configurar. A proteção do sistema continua ativa em segundo plano, mas nesse ritmo ela tem menos margem pra trabalhar.`;
}

// Tempo médio estimado por mensagem (delay curto + fatias amortizadas das
// pausas média/longa) — mesma conta que o worker produz na prática, usada só
// pra dar uma ideia de "quanto tempo essa fila toda vai levar".
export function estimateSecondsPerMessage(cfg: DispatchSettings): number {
  const curto = (cfg.delay_curto_min_seconds + cfg.delay_curto_max_seconds) / 2;
  const medioPauseSec = ((cfg.delay_medio_min_minutes + cfg.delay_medio_max_minutes) / 2) * 60;
  const longoPauseSec = ((cfg.delay_longo_min_minutes + cfg.delay_longo_max_minutes) / 2) * 60;
  const medioPorMsg = medioPauseSec / Math.max(1, cfg.delay_medio_a_cada);
  const longoPorMsg = longoPauseSec / Math.max(1, cfg.delay_longo_a_cada);
  return curto + medioPorMsg + longoPorMsg;
}

export function formatEtaForCount(cfg: DispatchSettings, contactCount: number): string {
  if (contactCount <= 0) return '—';
  const totalSeconds = estimateSecondsPerMessage(cfg) * contactCount;
  const totalHours = totalSeconds / 3600;
  const workHoursPerDay = 12; // horário comercial 8h-20h
  if (totalHours <= workHoursPerDay) {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    return h > 0 ? `~${h}h${m > 0 ? `${m.toString().padStart(2, '0')}min` : ''}` : `~${m}min`;
  }
  const days = Math.ceil(totalHours / workHoursPerDay);
  return `~${days} dia${days > 1 ? 's' : ''} úteis`;
}

export function useDispatchSettings() {
  const { orgId } = useAppUser();
  const [settings, setSettings] = useState<DispatchSettings | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('dispatch_settings')
      .select(
        'mode, daily_limit, delay_curto_min_seconds, delay_curto_max_seconds, delay_medio_a_cada, delay_medio_min_minutes, delay_medio_max_minutes, delay_longo_a_cada, delay_longo_min_minutes, delay_longo_max_minutes',
      )
      .eq('org_id', orgId)
      .maybeSingle();
    setSettings((data as DispatchSettings | null) ?? SAFE_PRESET);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (next: DispatchSettings) => {
      if (!orgId) return false;
      setSaving(true);
      const supabase = getSupabase();
      const { error } = await supabase
        .schema('whatsapp_hub')
        .from('dispatch_settings')
        .upsert({ org_id: orgId, ...next }, { onConflict: 'org_id' });
      setSaving(false);
      if (error) return false;
      setSettings(next);
      return true;
    },
    [orgId],
  );

  return { settings: settings ?? SAFE_PRESET, loading: settings === undefined, saving, refresh, save };
}
