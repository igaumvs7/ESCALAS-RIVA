import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Frown,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Smile,
  Star,
  Trophy,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { getSupabase } from '@/lib/supabase';
import type { PeriodRange } from '@/lib/dashboard';

// ----------------------------------------------------------------------------
// SegmentDetailDialog — pedido do dono (2026-09-06): clicar num dos 3 cards
// de base de contatos (Total / Alcançados via disparo em massa /
// Espontâneos) abre o mesmo funil do dashboard, restrito a esse grupo.
//
// Reescrito (2026-09-06, mesma rodada, feedback "achei esse painel péssimo,
// quero algo mais bonito, elaborado e mais detalhado... formato paisagem pra
// não ter rolamento"): a 1ª versão era uma lista estreita de caixinhas de
// texto genéricas, alta o bastante pra precisar de scroll. Reescrita como um
// dialog LARGO (paisagem), com um número-herói no topo e 3 seções lado a
// lado (Atendimento / Classificação do lead / Conversas) — mesmos
// ícones/cores do dashboard principal, pra ficar consistente — tudo visível
// de uma vez, sem rolar.
// ----------------------------------------------------------------------------

export type ContactSegment = 'total' | 'campaign' | 'spontaneous' | 'awaiting';

const SEGMENT_LABEL: Record<ContactSegment, string> = {
  total: 'Total de contatos',
  campaign: 'Alcançados via disparo em massa',
  spontaneous: 'Espontâneos',
  awaiting: 'Aguardando primeiro contato',
};

const SEGMENT_DESCRIPTION: Record<ContactSegment, string> = {
  total: 'Todos os contatos da sua conta, de qualquer período.',
  campaign: 'Contatos que já receberam pelo menos um disparo em massa (Vivas Envia), alguma vez.',
  spontaneous: 'Contatos que nunca receberam disparo em massa, mas já mandaram mensagem por conta própria alguma vez.',
  awaiting: 'Contatos que nunca receberam disparo em massa e nunca mandaram mensagem — ainda não teve nenhum contato com eles.',
};

interface SegmentDetail {
  total: number;
  responded: number;
  notResponded: number;
  waitingAi: number;
  transferredHuman: number;
  closed: number;
  open: number;
  interested: number;
  notInterested: number;
  qualified: number;
  sold: number;
}

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] px-3 py-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}1F` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-extrabold leading-tight text-[var(--color-text-primary)]">
          {value.toLocaleString('pt-BR')}
        </div>
        <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.015] p-3.5">
      <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

export function SegmentDetailDialog({
  segment,
  range,
  totalContacts,
  onClose,
}: {
  segment: ContactSegment | null;
  range: PeriodRange;
  totalContacts: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<SegmentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!segment) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    const supabase = getSupabase();
    void supabase
      .schema('whatsapp_hub')
      .rpc('lead_dashboard_segment_detail', {
        p_segment: segment,
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      })
      .then(({ data: raw, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error || !raw) return;
        const r = raw as Record<string, unknown>;
        setData({
          total: Number(r.total ?? 0),
          responded: Number(r.responded ?? 0),
          notResponded: Number(r.not_responded ?? 0),
          waitingAi: Number(r.waiting_ai ?? 0),
          transferredHuman: Number(r.transferred_human ?? 0),
          closed: Number(r.closed ?? 0),
          open: Number(r.open ?? 0),
          interested: Number(r.interested ?? 0),
          notInterested: Number(r.not_interested ?? 0),
          qualified: Number(r.qualified ?? 0),
          sold: Number(r.sold ?? 0),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [segment, range.from, range.to]);

  const pctOfBase = data && totalContacts > 0 ? Math.round((data.total / totalContacts) * 100) : null;
  const respondedPct = data && data.total > 0 ? Math.round((data.responded / data.total) * 100) : 0;

  return (
    <Dialog
      open={segment !== null}
      onClose={onClose}
      title={segment ? SEGMENT_LABEL[segment] : ''}
      description={segment ? SEGMENT_DESCRIPTION[segment] : ''}
      opaque
      widthClass="max-w-5xl"
    >
      {loading || !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Número-herói + taxa de resposta lado a lado — cabeçalho rico em
              vez de só um número solto. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.07)] px-5 py-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Contatos nesse grupo
                </div>
                <div className="mt-0.5 text-3xl font-extrabold text-[var(--accent-primary)]">
                  {data.total.toLocaleString('pt-BR')}
                </div>
              </div>
              {pctOfBase !== null && segment !== 'total' && (
                <div className="text-right">
                  <div className="text-lg font-bold text-[var(--color-text-primary)]">{pctOfBase}%</div>
                  <div className="text-[10px] text-[var(--color-text-secondary)]">da sua base</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.07)] px-5 py-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Taxa de resposta no período
                </div>
                <div className="mt-0.5 text-3xl font-extrabold text-[var(--data-green,#34D399)]">
                  {respondedPct}%
                </div>
              </div>
              <div className="text-right text-[11px] text-[var(--color-text-secondary)]">
                {data.responded} de {data.total} responderam
              </div>
            </div>
          </div>

          {/* 3 seções lado a lado — formato paisagem, tudo visível de uma vez. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Section title="Atendimento">
              <MiniStat label="Responderam" value={data.responded} icon={UserCheck} color="var(--data-green, #34D399)" />
              <MiniStat label="Não responderam" value={data.notResponded} icon={UserX} color="var(--data-orange, #FB923C)" />
              <MiniStat label="IA aguardando" value={data.waitingAi} icon={Bot} color="var(--accent-primary)" />
              <MiniStat label="Com humano" value={data.transferredHuman} icon={MessageCircleQuestion} color="var(--accent-secondary)" />
            </Section>

            <Section title="Classificação do lead">
              <MiniStat label="Tem interesse" value={data.interested} icon={Smile} color="var(--data-green, #34D399)" />
              <MiniStat label="Sem interesse" value={data.notInterested} icon={Frown} color="var(--data-red, #F87171)" />
              <MiniStat label="Qualificados" value={data.qualified} icon={Star} color="var(--accent-primary)" />
              <MiniStat label="Vendas concluídas" value={data.sold} icon={Trophy} color="var(--data-green, #34D399)" />
            </Section>

            <Section title="Conversas">
              <MiniStat label="Em aberto" value={data.open} icon={Inbox} color="var(--accent-secondary)" />
              <MiniStat label="Fechadas" value={data.closed} icon={CheckCircle2} color="var(--accent-primary)" />
            </Section>
          </div>
        </div>
      )}
    </Dialog>
  );
}
