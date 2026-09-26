import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, QrCode, Smartphone, Power, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPulse } from '@/components/ui/StatusPulse';
import { getSupabase } from '@/lib/supabase';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useWebjsSession } from '@/hooks/useWebjsSession';

// ----------------------------------------------------------------------------
// WebjsSettings — canal grátis (VIVAS ENVIA via Baileys), a alternativa
// não-oficial ao Zernio. O trabalho pesado (conectar, gerar QR, manter a
// sessão) roda no worker separado (fora da Vercel/Supabase, num VPS) — essa
// tela só ativa/desativa e mostra o status ao vivo.
//
// status='blocked': detectado automaticamente (worker vê o WhatsApp recusar
// com código 403) OU reportado manualmente pelo botão "Fui bloqueado" — nem
// sempre dá pra confiar 100% na detecção automática. Depois das 24h, entra
// num modo de recuperação (limite diário reduzido por alguns dias) antes de
// voltar ao ritmo normal.
// ----------------------------------------------------------------------------

async function invokeErrorMessage(error: unknown, data: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* corpo não-JSON */
    }
  }
  return (error as { message?: string } | null)?.message ?? 'Erro desconhecido';
}

// Caixa de espera do QR — pedido do dono (2026-09-15): "ele demorou um
// tempo pra aparecer, eu só queria entender melhor... colocar um contador
// tipo 10 9 8... em verde, e quando gerar mostrar GERADO com um check".
// Primeira versão usava um "10" fixo, chutado — o dono perguntou se dava pra
// pegar o tempo REAL em vez de inventar um número. Não dá pra saber ANTES
// do clique quanto vai demorar (depende da rede/do WhatsApp naquele
// momento — medido no servidor, ficou entre 0.6s e 1.1s, mas varia), então
// a contagem se calibra sozinha: guarda no localStorage QUANTO REALMENTE
// demorou da última vez (ver QR_GEN_MS_KEY, gravado em handleActivate) e
// usa isso (+1s de folga) como ponto de partida da próxima vez — sem
// histórico ainda, começa em 3s (bem acima do que o servidor mostrou na
// prática). Se ainda não chegou o QR quando zera, para de contar e mostra
// "só mais um instante" em vez de voltar pra 10 (evita parecer travado).
const QR_GEN_MS_KEY = 'vivas_webjs_qr_gen_ms';

function estimativaContagemInicial(): number {
  try {
    const raw = localStorage.getItem(QR_GEN_MS_KEY);
    const ms = raw ? Number(raw) : NaN;
    if (Number.isFinite(ms) && ms > 0) {
      return Math.min(Math.max(Math.ceil(ms / 1000) + 1, 1), 15);
    }
  } catch {
    /* localStorage indisponível (aba anônima etc.) — usa o padrão */
  }
  return 3;
}

function QrCountdownBox({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  useEffect(() => {
    setCount(initialCount);
    const interval = setInterval(() => {
      setCount((c) => Math.max(c - 1, 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [initialCount]);
  return (
    <div className="flex h-56 w-56 flex-col items-center justify-center gap-1.5 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10">
      {count > 0 ? (
        <>
          <span className="text-5xl font-extrabold tabular-nums text-[var(--color-success)]">{count}</span>
          <span className="text-xs font-semibold text-[var(--color-success)]">Gerando QR code...</span>
        </>
      ) : (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-[var(--color-success)]" />
          <span className="text-xs font-semibold text-[var(--color-success)]">Só mais um instante...</span>
        </>
      )}
    </div>
  );
}

function QrGeradoBox() {
  return (
    <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-success)]/40 bg-[var(--color-success)]/10">
      <span className="text-4xl">✅</span>
      <span className="text-sm font-extrabold tracking-wide text-[var(--color-success)]">GERADO</span>
    </div>
  );
}

function fmtCountdown(untilIso: string): string {
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return 'a qualquer momento';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return `~${Math.ceil(hours / 24)} dia${hours >= 48 ? 's' : ''}`;
  return `${hours}h${mins.toString().padStart(2, '0')}min`;
}

export function WebjsSettings() {
  const { session, refresh, setSession } = useWebjsSession();
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [waitingTooLong, setWaitingTooLong] = useState(false);
  const [qrFlash, setQrFlash] = useState(false);
  const prevQrRef = useRef<string | null>(null);
  const clicadoEmRef = useRef<number | null>(null);
  const confirm = useConfirm();

  // Flash "GERADO ✅" por ~1.1s assim que o QR chega, antes de trocar pra
  // imagem de verdade — dá o feedback de "prontinho" em vez de só trocar
  // instantaneamente de contador pra QR. Também é aqui que o tempo REAL
  // (desde o clique em handleActivate) é medido e salvo — é o que calibra
  // o número inicial da próxima contagem (ver estimativaContagemInicial).
  useEffect(() => {
    const tinha = !!prevQrRef.current;
    const tem = !!session?.qr_data_url;
    prevQrRef.current = session?.qr_data_url ?? null;
    if (!tinha && tem) {
      if (clicadoEmRef.current) {
        const decorridoMs = Date.now() - clicadoEmRef.current;
        try {
          localStorage.setItem(QR_GEN_MS_KEY, String(decorridoMs));
        } catch {
          /* localStorage indisponível — sem calibração, tudo bem */
        }
        clicadoEmRef.current = null;
      }
      setQrFlash(true);
      const t = setTimeout(() => setQrFlash(false), 1100);
      return () => clearTimeout(t);
    }
  }, [session?.qr_data_url]);

  // Se ficar "preparando conexão" por muito tempo, o mais provável é que o
  // worker (webjs-worker, roda fora da Vercel/Supabase, numa VPS própria)
  // não esteja de pé — sem isso o QR nunca é gerado. Aviso depois de 45s em
  // vez de girar pra sempre sem explicação nenhuma.
  useEffect(() => {
    setWaitingTooLong(false);
    if (session?.status !== 'disconnected' && session?.status !== 'qr' && session?.status !== 'authenticated') return;
    if (session.status === 'qr' && session.qr_data_url) return;
    const t = setTimeout(() => setWaitingTooLong(true), 45_000);
    return () => clearTimeout(t);
  }, [session?.status, session?.qr_data_url]);

  const handleActivate = async () => {
    clicadoEmRef.current = Date.now();
    setBusy(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('webjs-activate', { body: {} });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error('Não foi possível ativar', { description: await invokeErrorMessage(error, data) });
      return;
    }
    toast.success('Canal ativado. Aguardando o QR code...');
    await refresh();
  };

  const handleDeactivate = async () => {
    setBusy(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('webjs-deactivate', { body: {} });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error('Não foi possível desconectar', { description: await invokeErrorMessage(error, data) });
      return;
    }
    toast.success('Desconectado.');
    setSession(null);
  };

  const handleReportBlock = async () => {
    const ok = await confirm({
      title: 'Reportar bloqueio',
      description: 'Confirma que seu WhatsApp Web saiu do notebook com aviso de bloqueio? Isso vai pausar os envios por 24h.',
      confirmLabel: 'Confirmar',
      danger: true,
    });
    if (!ok) return;
    setReporting(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('webjs-report-block', { body: {} });
    setReporting(false);
    if (error || !data?.ok) {
      toast.error('Não foi possível registrar o bloqueio', { description: await invokeErrorMessage(error, data) });
      return;
    }
    toast.success('Bloqueio registrado. Envios pausados por 24h.');
    await refresh();
  };

  if (session === undefined) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </Card>
    );
  }

  const inRecovery =
    session?.recovery_until && new Date(session.recovery_until).getTime() > Date.now();

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">Conectar WhatsApp</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Aponte a câmera do celular que vai enviar as mensagens para o QR code.
            </p>
          </header>

          {!session && (
            <Button type="button" onClick={handleActivate} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando QR code...
                </>
              ) : (
                <>
                  <Smartphone className="h-4 w-4" />
                  Gerar QR code
                </>
              )}
            </Button>
          )}

          {session && session.status === 'blocked' && (
            <div className="space-y-3 rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[var(--color-error)] flex-shrink-0" />
                <span className="text-sm font-semibold text-[var(--color-error)]">
                  {session.block_kind === 'risk'
                    ? 'Disparo pausado por precaução — indícios de risco detectados'
                    : 'Número bloqueado temporariamente pelo WhatsApp'}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {session.block_kind === 'risk' ? (
                  <>
                    Nosso sistema identificou sinais que costumam anteceder um bloqueio real do
                    WhatsApp ({session.last_error}) — isso é um INDÍCIO calculado, ainda não uma
                    confirmação do WhatsApp. Por segurança, pausamos os envios automaticamente antes
                    que virasse um bloqueio de verdade.
                  </>
                ) : (
                  <>{session.last_error} Envios pausados por segurança — reenviar agora só pioraria a situação.</>
                )}
              </p>
              <div className="rounded-lg bg-black/10 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                  O que vai acontecer a partir daqui
                </p>
                <ol className="text-xs text-[var(--color-text-secondary)] list-decimal list-inside space-y-1">
                  <li>Os envios ficam pausados pelas próximas 24h — nenhuma mensagem sai nesse período.</li>
                  <li>
                    Depois das 24h, o número volta a conectar sozinho, mas com o limite reduzido pra{' '}
                    <strong>{session.recovery_daily_limit ?? 40} mensagens/dia</strong> por alguns dias
                    (essa é a {session.block_count}ª vez — quanto mais vezes, mais dias de cautela).
                  </li>
                  <li>Você não precisa fazer nada manualmente — nem escanear QR de novo, nem reiniciar nada.</li>
                  <li>Se não bloquear de novo nesse período, volta sozinho ao ritmo configurado normalmente.</li>
                </ol>
              </div>
              {session.blocked_until && new Date(session.blocked_until).getTime() > Date.now() && (
                <p className="text-sm">
                  Previsão de voltar a conectar: <strong>{fmtCountdown(session.blocked_until)}</strong>
                </p>
              )}
            </div>
          )}

          {session && session.status !== 'blocked' && inRecovery && (
            <div className="flex items-start gap-2 rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-[#FBBF24] flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Reconstruindo confiança do chip</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Foi bloqueado recentemente ({session.block_count}ª vez). Limite temporário de{' '}
                  <strong>{session.recovery_daily_limit} mensagens/dia</strong> até{' '}
                  {new Date(session.recovery_until as string).toLocaleDateString('pt-BR')} — depois volta
                  ao ritmo normal sozinho, se não bloquear de novo nesse período.
                </p>
              </div>
            </div>
          )}

          {session && session.status === 'disconnected' && session.last_error && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 text-[var(--color-error)]" />
                <span className="text-sm">{session.last_error}</span>
              </div>
              <Button type="button" size="sm" onClick={handleActivate} disabled={busy}>
                <QrCode className="h-4 w-4" />
                Gerar novo QR code
              </Button>
            </div>
          )}

          {session &&
            ((session.status === 'disconnected' && !session.last_error) ||
              session.status === 'qr' ||
              session.status === 'authenticated') && (
            <div className="flex flex-col items-center gap-4 py-4">
              {session.status === 'qr' && session.qr_data_url && !qrFlash ? (
                <img
                  src={session.qr_data_url}
                  alt="QR code do WhatsApp"
                  className="h-56 w-56 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white p-2"
                />
              ) : session.qr_data_url && qrFlash ? (
                <QrGeradoBox />
              ) : session.status === 'authenticated' ? (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)]">
                  <div className="flex flex-col items-center gap-2 text-[var(--color-text-secondary)]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-xs">Confirmando no celular...</span>
                  </div>
                </div>
              ) : (
                <QrCountdownBox initialCount={estimativaContagemInicial()} />
              )}
              <p className="text-xs text-[var(--color-text-secondary)] text-center max-w-xs">
                No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho, e
                aponta a câmera pro QR code acima.
              </p>
              {waitingTooLong && !session.qr_data_url && (
                <p className="text-xs text-[#FBBF24] text-center max-w-xs">
                  Isso está demorando mais que o normal — o servidor que gera a conexão pode
                  estar fora do ar no momento. Se persistir, fale com o suporte.
                </p>
              )}
              {session.last_error && (
                <p className="text-xs text-[var(--color-error)] text-center">{session.last_error}</p>
              )}
              <Button type="button" variant="outline" onClick={handleDeactivate} disabled={busy}>
                Cancelar
              </Button>
            </div>
          )}

          {session && session.status === 'reconnecting' && (
            <div className="flex items-center justify-between rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-[#FBBF24]" />
                <span className="text-sm">
                  Reconectando{session.phone ? ` — ${session.phone}` : ''}... a conexão caiu, o sistema
                  está tentando sozinho, sem precisar escanear de novo.
                </span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleDeactivate} disabled={busy}>
                <Power className="h-4 w-4" />
                Desconectar
              </Button>
            </div>
          )}

          {session && session.status === 'ready' && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <StatusPulse tone="success" />
                <span className="text-sm">
                  Conectado {session.phone ? `— ${session.phone}` : ''}
                </span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleDeactivate} disabled={busy}>
                <Power className="h-4 w-4" />
                Desconectar
              </Button>
            </div>
          )}

          {/* Aviso ANTECIPADO (2026-09-11): conectado, mas o WhatsApp restringiu
              o envio pra contato novo (erro 463 — reach-out time-lock). O worker
              já pausou a campanha sozinho; aqui só mostramos o porquê. Ao
              conectar, last_error volta pra null — então ter last_error com a
              sessão em 'ready' significa exatamente esse caso. É o único
              momento em que dá pra avisar ANTES do bloqueio de 24h. */}
          {session && session.status === 'ready' && session.last_error && (
            <div className="rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                <span className="text-sm font-bold text-[var(--accent-primary)]">
                  Disparo pausado automaticamente — atenção
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                {session.last_error}
              </p>
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                <strong className="text-[var(--color-text-primary)]">Não force o envio.</strong>{' '}
                Seu número ainda está conectado e ainda responde quem já te chamou.
                Continuar disparando agora é o que vira bloqueio de 24h.
              </p>
            </div>
          )}

          {/* Botão manual — camada de segurança pra quando a detecção automática
              não pegar. Visível sempre que já existe uma sessão e ela não está
              já marcada como bloqueada. */}
          {session && session.status !== 'blocked' && (
            <button
              type="button"
              onClick={() => void handleReportBlock()}
              disabled={reporting}
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-error)] underline underline-offset-2 disabled:opacity-50"
            >
              {reporting ? 'Registrando...' : 'Meu WhatsApp Web saiu do notebook com aviso de bloqueio — reportar aqui'}
            </button>
          )}
        </div>
      </Card>

      {(session?.status === 'blocked' || inRecovery) && <RecoveryGuide />}
    </div>
  );
}

function RecoveryGuide() {
  return (
    <Card>
      <div className="space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[var(--accent-primary)]" />
          Como reconstruir a confiança do chip
        </h3>
        <ol className="space-y-2 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
          <li>Não force reenvio nem reinstale o WhatsApp tentando "burlar" o bloqueio — isso piora, não ajuda.</li>
          <li>Use o número normalmente pelo celular nesse período: converse com contatos reais, receba ligação, mande foto — comportamento humano de verdade.</li>
          <li>Quando o sistema voltar a conectar, ele já vai enviar num ritmo bem mais devagar automaticamente — não precisa mexer em nada.</li>
          <li>Evite mandar a mesma mensagem em texto idêntico pra muita gente nos primeiros dias depois de voltar.</li>
          <li>Se bloquear de novo logo depois de voltar ao normal, é sinal forte de que esse chip está no limite — considere aquecer um número novo em paralelo.</li>
        </ol>
      </div>
    </Card>
  );
}
