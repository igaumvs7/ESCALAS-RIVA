import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, RefreshCw, Send } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useTemplates } from '@/hooks/useTemplates';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface NonResponder {
  conversation_id: string;
  contact_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_outbound_at: string;
  hours_since: number;
}

// ----------------------------------------------------------------------------
// NonRespondersTab — relatório manual de "não responderam" (substitui o
// follow-up automático, que dependia do Zernio/UAZAPI e foi descontinuado).
// Regra de 24h: só aparece aqui quem foi contatado há mais de 24h e nunca
// respondeu — reenviar cedo demais aumenta risco de banimento do número.
// ----------------------------------------------------------------------------
export function NonRespondersTab() {
  const [rows, setRows] = useState<NonResponder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showResendDialog, setShowResendDialog] = useState(false);
  const { templates } = useTemplates();
  const { createAndQueue } = useCampaigns();

  const load = async () => {
    setLoading(true);
    const { data, error } = await getSupabase()
      .schema('whatsapp_hub')
      .rpc('non_responders', { p_hours: 24 });
    setLoading(false);
    if (error) {
      toast.error('Falha ao carregar relatório', { description: error.message });
      return;
    }
    setRows((data ?? []) as NonResponder[]);
    setSelected(new Set());
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.contact_id))));
  };

  const toggleOne = (contactId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const exportCsv = () => {
    const target = rows.filter((r) => selected.size === 0 || selected.has(r.contact_id));
    const header = 'Nome;Telefone;Última mensagem enviada;Horas sem resposta\n';
    const body = target
      .map((r) => `${(r.contact_name ?? '').replace(/;/g, ',')};${r.contact_phone ?? ''};${new Date(r.last_outbound_at).toLocaleString('pt-BR')};${r.hours_since}`)
      .join('\n');
    const csv = '﻿' + header + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nao-responderam-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResend = async (templateId: string) => {
    const contactIds = rows.filter((r) => selected.has(r.contact_id)).map((r) => r.contact_id);
    if (contactIds.length === 0) return;
    try {
      const result = await createAndQueue({
        name: `Reenvio — ${new Date().toLocaleDateString('pt-BR')}`,
        template_id: templateId,
        audience_filter: { contact_ids: contactIds },
        variable_mapping: {},
        scheduled_at: null,
        channel_id: null,
      });
      if (result) {
        toast.success(`Reenvio criado para ${result.queued} contato${result.queued === 1 ? '' : 's'}.`);
        setShowResendDialog(false);
        void load();
      }
    } catch (err) {
      toast.error('Falha ao criar reenvio', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Contatos que receberam mensagem há mais de <strong className="text-[var(--color-text-primary)]">24 horas</strong> e
          nunca responderam. É proposital esperar 1 dia inteiro antes de reaparecer aqui — reenviar cedo demais
          aumenta muito o risco do WhatsApp bloquear o número.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-[var(--color-text-secondary)]">
          {rows.length} contato{rows.length === 1 ? '' : 's'} nessa lista
          {selected.size > 0 && ` · ${selected.size} selecionado${selected.size === 1 ? '' : 's'}`}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Atualizar
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button onClick={() => setShowResendDialog(true)} disabled={selected.size === 0}>
            <Send className="h-4 w-4" /> Enviar mensagem novamente
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-label opacity-60">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-secondary)]">
            Ninguém nessa situação agora — ou todo mundo respondeu, ou ainda não passou 24h do envio.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(var(--accent-secondary-rgb),0.1)] text-left text-[var(--color-text-secondary)]">
                <th className="p-3 w-8">
                  <input type="checkbox" checked={selected.size === rows.length} onChange={toggleAll} className="accent-[var(--accent-primary)]" />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Telefone</th>
                <th className="p-3">Enviado em</th>
                <th className="p-3">Há quanto tempo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.conversation_id} className="border-b border-[rgba(var(--accent-secondary-rgb),0.06)] last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.contact_id)}
                      onChange={() => toggleOne(r.contact_id)}
                      className="accent-[var(--accent-primary)]"
                    />
                  </td>
                  <td className="p-3 text-[var(--color-text-primary)]">{r.contact_name || '—'}</td>
                  <td className="p-3 font-mono text-[var(--color-text-secondary)]">{r.contact_phone}</td>
                  <td className="p-3 text-[var(--color-text-secondary)]">{new Date(r.last_outbound_at).toLocaleString('pt-BR')}</td>
                  <td className="p-3 text-[var(--color-text-secondary)]">{Math.floor(r.hours_since / 24)}d {Math.floor(r.hours_since % 24)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showResendDialog && (
        <ResendDialog
          templates={templates}
          count={selected.size}
          onClose={() => setShowResendDialog(false)}
          onConfirm={handleResend}
        />
      )}
    </div>
  );
}

function ResendDialog({
  templates,
  count,
  onClose,
  onConfirm,
}: {
  templates: { id: string; name: string }[];
  count: number;
  onClose: () => void;
  onConfirm: (templateId: string) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState(false);

  return (
    <Dialog open onClose={onClose} title="Enviar mensagem novamente" widthClass="max-w-md" opaque>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
        Vai criar uma campanha nova pra {count} contato{count === 1 ? '' : 's'} selecionado{count === 1 ? '' : 's'}.
        Escolha o template:
      </p>
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="h-11 w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 text-sm text-[var(--color-text-primary)] [&>option]:bg-[var(--color-bg-primary)]"
      >
        <option value="">Selecione um template</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1"
          disabled={!templateId || sending}
          onClick={async () => { setSending(true); await onConfirm(templateId); setSending(false); }}
        >
          {sending ? 'Enviando...' : 'Confirmar envio'}
        </Button>
        <button onClick={onClose} className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
          Cancelar
        </button>
      </div>
    </Dialog>
  );
}
