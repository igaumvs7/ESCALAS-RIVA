import { useCallback, useEffect, useState } from 'react';
import { type PeriodRange } from '@/lib/dashboard';
import { getSupabase } from '@/lib/supabase';

export interface TagCount {
  name: string;
  color: string | null;
  count: number;
}

export interface LeadMetrics {
  // Base de contatos — os 3 abaixo são SEMPRE "de qualquer período" (não
  // seguem as abas Hoje/7d/30d/etc.), formam uma partição:
  // totalContacts = reachedViaCampaign + spontaneousContacts + awaitingFirstContact.
  // Ideia do dono (2026-09-06, 3ª rodada, depois de achar um bug real): uma
  // lista importada e nunca contatada estava contando como "espontânea" só
  // por nunca ter recebido campanha — mas "espontâneo" tem que significar
  // "chegou por conta própria" (mandou mensagem), não "ainda não recebi
  // campanha". Agora: alcançados = já recebeu campanha algum dia;
  // espontâneos = nunca recebeu campanha MAS já mandou mensagem alguma vez;
  // aguardando primeiro contato = nem campanha, nem nunca mandou mensagem
  // (lista parada, ninguém tocou ainda).
  totalContacts: number;
  reachedViaCampaign: number;
  spontaneousContacts: number;
  awaitingFirstContact: number;
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
  byTag: TagCount[];
}

const EMPTY_METRICS: LeadMetrics = {
  totalContacts: 0,
  reachedViaCampaign: 0,
  spontaneousContacts: 0,
  awaitingFirstContact: 0,
  responded: 0,
  notResponded: 0,
  waitingAi: 0,
  transferredHuman: 0,
  closed: 0,
  open: 0,
  interested: 0,
  notInterested: 0,
  qualified: 0,
  sold: 0,
  byTag: [],
};

// ----------------------------------------------------------------------------
// useLeadsDashboard — painel de LEADS (substitui o antigo painel de vendas em
// R$). Toda a agregação roda no banco via RPC `lead_dashboard_metrics`
// (respeita RLS/org automaticamente) — ver migration 20260822120100.
// ----------------------------------------------------------------------------
export function useLeadsDashboard(range: PeriodRange) {
  const [metrics, setMetrics] = useState<LeadMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .schema('whatsapp_hub')
      .rpc('lead_dashboard_metrics', {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const raw = (data ?? {}) as Record<string, unknown>;
    setMetrics({
      totalContacts: Number(raw.total_contacts ?? 0),
      reachedViaCampaign: Number(raw.reached_via_campaign ?? 0),
      spontaneousContacts: Number(raw.spontaneous_contacts ?? 0),
      awaitingFirstContact: Number(raw.awaiting_first_contact ?? 0),
      responded: Number(raw.responded ?? 0),
      notResponded: Number(raw.not_responded ?? 0),
      waitingAi: Number(raw.waiting_ai ?? 0),
      transferredHuman: Number(raw.transferred_human ?? 0),
      closed: Number(raw.closed ?? 0),
      open: Number(raw.open ?? 0),
      interested: Number(raw.interested ?? 0),
      notInterested: Number(raw.not_interested ?? 0),
      qualified: Number(raw.qualified ?? 0),
      sold: Number(raw.sold ?? 0),
      byTag: Array.isArray(raw.by_tag) ? (raw.by_tag as TagCount[]) : [],
    });
  }, [range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { metrics, loading, error, reload };
}
