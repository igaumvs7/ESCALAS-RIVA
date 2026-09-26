import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

// ----------------------------------------------------------------------------
// useFeedback — reescrito (2026-09-01): virou avaliação de verdade (nota 1-5
// + comentário opcional, enviada uma vez), não mais um mini-suporte com
// thread/resposta/status. Pedido do dono: "a aba de feedback ela esta
// funcionando como se fosse um suporte... queria que fosse uma parte de
// feedback mesmo" — escolheu "avaliação rápida + comentário" quando
// perguntado o formato. RLS: org enxerga só as próprias avaliações; super
// admin enxerga TODAS (feedback é dirigido a ele, não é dado de domínio do
// tenant — ver whatsapp_hub.feedback_entries_select policy).
//
// O sistema antigo (feedback_threads/feedback_messages, RPCs
// submit_feedback/reply_feedback/set_feedback_status) continua no banco
// (só tinha 1 registro de teste) mas não é mais usado por nenhuma tela.
// ----------------------------------------------------------------------------

export interface FeedbackEntryRow {
  id: string;
  org_id: string;
  created_by: string;
  rating: number;
  comment: string | null;
  read_at: string | null;
  created_at: string;
  organizations?: { name: string } | null;
}

export function useFeedbackEntries() {
  const [entries, setEntries] = useState<FeedbackEntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('feedback_entries')
      .select('*, organizations(name)')
      .order('created_at', { ascending: false });
    setEntries((data ?? []) as FeedbackEntryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const supabase = getSupabase();
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`feedback_entries:${suffix}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'whatsapp_hub', table: 'feedback_entries' },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return { entries, loading, reload };
}

export async function submitFeedbackRating(rating: number, comment?: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema('whatsapp_hub')
    .rpc('submit_feedback_rating', { p_rating: rating, p_comment: comment?.trim() || null });
  if (error) throw error;
  return data as string;
}

export async function markFeedbackRead(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.schema('whatsapp_hub').rpc('mark_feedback_read', { p_id: id });
  if (error) throw error;
}
