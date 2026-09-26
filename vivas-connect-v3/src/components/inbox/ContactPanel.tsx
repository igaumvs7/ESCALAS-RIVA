import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Bot, CheckCircle2, CircleX, Frown, Mail, Pause, Phone, Pin, PinOff, Play, RotateCcw, Smile, Star, User } from 'lucide-react';
import type { LeadInterest } from '@/types/inbox';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';
import { getSupabase } from '@/lib/supabase';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { cn } from '@/lib/utils';
import type { ConversationWithContact } from '@/types/inbox';
import { ContactTagsEditor } from './ContactTagsEditor';
import { CustomFieldsEditor } from './CustomFieldsEditor';

interface ContactPanelProps {
  conversation: ConversationWithContact;
  // IA habilitada para o canal desta conversa (configurações). false → "Humano".
  aiEnabled?: boolean;
  onPauseAI: () => Promise<void>;
  onResumeAI: () => Promise<void>;
  onClose: () => Promise<void>;
  onReopen: () => Promise<void>;
  onPinNote: (note: string | null) => Promise<void>;
  onTogglePin: (pinned: boolean) => Promise<void>;
  onArchive: (archived: boolean) => Promise<void>;
  onContactRefresh?: () => void;
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'gray'; children: React.ReactNode }) {
  const cls =
    tone === 'green'
      ? 'bg-[rgba(16,185,129,0.12)] text-[var(--color-success)]'
      : tone === 'amber'
        ? 'bg-[rgba(245,158,11,0.12)] text-[#FBBF24]'
        : 'bg-white/5 text-[var(--color-text-secondary)]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function ContactPanel({
  conversation, aiEnabled = true,
  onPauseAI, onResumeAI, onClose, onReopen, onPinNote, onTogglePin, onArchive, onContactRefresh,
}: ContactPanelProps) {
  const contact = conversation.contact;
  const displayName = contact?.name?.trim() || contact?.phone || '—';
  const [noteDraft, setNoteDraft] = useState(conversation.pinned_note ?? '');
  const [savingNote, setSavingNote] = useState(false);
  // Interesse do lead (painel de Leads) — otimista, sincroniza ao trocar de conversa.
  const [leadInterest, setLeadInterest] = useState(conversation.lead_interest);
  const [savingInterest, setSavingInterest] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    setLeadInterest(conversation.lead_interest);
  }, [conversation.id, conversation.lead_interest]);

  const handleSetInterest = async (value: LeadInterest) => {
    const next: LeadInterest = leadInterest === value ? 'nao_classificado' : value;
    setSavingInterest(true);
    const previous = leadInterest;
    setLeadInterest(next);
    const { error } = await getSupabase()
      .schema('whatsapp_hub')
      .from('conversations')
      .update({ lead_interest: next })
      .eq('id', conversation.id);
    setSavingInterest(false);
    if (error) {
      setLeadInterest(previous);
      toast.error('Falha ao marcar interesse', { description: error.message });
    }
  };

  // Sincroniza o rascunho da nota com o valor do banco. Duas regras:
  //   1. Ao TROCAR de conversa, sempre reseta (senão a nota de uma conversa
  //      vazava pra seguinte e podia ser salva na errada).
  //   2. Na MESMA conversa, só acompanha o realtime enquanto o operador NÃO
  //      tem alteração pendente -- assim uma edição feita na barra do topo
  //      (PinnedNoteBar), em outra aba ou em outro aparelho aparece aqui
  //      sozinha (bug reportado pelo dono: "as notas não estão sincronizadas"),
  //      sem nunca apagar o que ele está digitando aqui.
  const lastSyncedNote = useRef(conversation.pinned_note ?? '');
  useEffect(() => {
    setNoteDraft(conversation.pinned_note ?? '');
    lastSyncedNote.current = conversation.pinned_note ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    const doBanco = conversation.pinned_note ?? '';
    if (doBanco === lastSyncedNote.current) return; // nada mudou no banco
    // Só sobrescreve se o operador não tiver edição pendente aqui.
    const temEdicaoPendente = noteDraft !== lastSyncedNote.current;
    if (!temEdicaoPendente) setNoteDraft(doBanco);
    lastSyncedNote.current = doBanco;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.pinned_note]);

  const handlePause = async () => {
    try {
      await onPauseAI();
      toast.success('IA pausada — você assumiu esta conversa.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleResume = async () => {
    try {
      await onResumeAI();
      toast.success('IA reativada.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleClose = async () => {
    const ok = await confirm({
      title: 'Fechar conversa',
      description: 'Fechar esta conversa?',
      confirmLabel: 'Fechar',
    });
    if (!ok) return;
    try {
      await onClose();
      toast.success('Conversa fechada.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleReopen = async () => {
    try {
      await onReopen();
      toast.success('Conversa reaberta — você assumiu o atendimento.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleArchive = async () => {
    try {
      await onArchive(!conversation.archived);
      toast.success(conversation.archived ? 'Conversa desarquivada.' : 'Conversa arquivada.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleTogglePin = async () => {
    try {
      await onTogglePin(!conversation.pinned);
      toast.success(conversation.pinned ? 'Conversa desfixada.' : 'Conversa fixada no topo.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const isClosed = conversation.status === 'closed';

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      await onPinNote(noteDraft);
      toast.success('Nota fixa salva.');
    } catch (err) {
      toast.error('Falha', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="h-full p-5 space-y-5 overflow-y-auto">
      <div className="text-center">
        <Avatar
          src={contact?.profile_pic_url}
          name={displayName}
          size="lg"
          className="mx-auto shadow-[0_0_30px_rgba(var(--accent-secondary-rgb),0.25)]"
        />
        <div className="mt-3 text-lg font-bold text-display text-[var(--color-text-primary)]">
          {displayName}
        </div>
        {contact?.phone && (
          <div className="text-xs font-mono text-[var(--color-text-secondary)] mt-0.5">
            {contact.phone}
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {/* Atendente: Fechada > IA ativa (canal com IA ligada e sem pausa) >
              IA pausada > Humano (IA do canal desligada nas configurações). */}
          {isClosed ? (
            <Badge tone="gray"><CircleX className="h-3 w-3" /> Fechada</Badge>
          ) : !aiEnabled ? (
            <Badge tone="green"><User className="h-3 w-3" /> Humano</Badge>
          ) : conversation.ai_paused ? (
            <Badge tone="amber"><Bot className="h-3 w-3" /> IA pausada</Badge>
          ) : (
            <Badge tone="green"><Bot className="h-3 w-3" /> IA ativa</Badge>
          )}
        </div>

        {/* Interesse — automático (o sistema marca sozinho: respondeu =
            interessado, 24h sem responder = sem interesse). Só exibido
            quando já há alguma leitura, pra não mostrar "sem interesse"
            prematuramente. */}
        {leadInterest === 'interessado' && (
          <div className="mt-3 flex justify-center">
            <Badge tone="green"><Smile className="h-3 w-3" /> Tem interesse</Badge>
          </div>
        )}
        {leadInterest === 'sem_interesse' && (
          <div className="mt-3 flex justify-center">
            <Badge tone="amber"><Frown className="h-3 w-3" /> Sem interesse (24h sem resposta)</Badge>
          </div>
        )}
        {(leadInterest === 'qualificado' || leadInterest === 'venda_concluida') && (
          <div className="mt-3 flex justify-center">
            <Badge tone="green">
              {leadInterest === 'venda_concluida' ? <CheckCircle2 className="h-3 w-3" /> : <Star className="h-3 w-3" />}
              {leadInterest === 'venda_concluida' ? 'Venda concluída' : 'Lead qualificado'}
            </Badge>
          </div>
        )}

        {/* Atualização manual — só qualificado/venda concluída, o resto é automático. */}
        <div className="mt-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] p-2.5">
          <div className="text-center text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2">
            Alguma atualização sobre esse lead?
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={savingInterest}
              onClick={() => void handleSetInterest('qualificado')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50',
                leadInterest === 'qualificado'
                  ? 'bg-[rgba(var(--accent-primary-rgb),0.16)] text-[var(--accent-primary)] border border-[rgba(var(--accent-primary-rgb),0.4)]'
                  : 'text-[var(--color-text-secondary)] border border-[rgba(var(--accent-secondary-rgb),0.15)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <Star className="h-3.5 w-3.5" /> Lead qualificado
            </button>
            <button
              type="button"
              disabled={savingInterest}
              onClick={() => void handleSetInterest('venda_concluida')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50',
                leadInterest === 'venda_concluida'
                  ? 'bg-[rgba(16,185,129,0.16)] text-[var(--color-success)] border border-[rgba(16,185,129,0.4)]'
                  : 'text-[var(--color-text-secondary)] border border-[rgba(var(--accent-secondary-rgb),0.15)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Venda concluída
            </button>
          </div>
        </div>
      </div>

      {/* Nota fixa da conversa */}
      <div className="space-y-2">
        <div className="text-label flex items-center gap-1.5"><Pin className="h-3 w-3" /> Nota fixa</div>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          placeholder="Nota visível no topo da conversa…"
          className="w-full rounded-lg border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.04)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#FBBF24] resize-none"
        />
        {noteDraft !== (conversation.pinned_note ?? '') && (
          <Button size="sm" variant="outline" onClick={handleSaveNote} disabled={savingNote}>
            Salvar nota
          </Button>
        )}
      </div>

      {/* Tags rápidas */}
      {contact?.id && <ContactTagsEditor contactId={contact.id} />}

      <div className="space-y-2">
        <div className="text-label">Contato</div>
        <div className="space-y-2 text-sm">
          {contact?.email ? (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{contact.email}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <Phone className="h-3.5 w-3.5" />
            <span className="font-mono">{contact?.phone ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Campos personalizados (editáveis) */}
      {contact?.id && (
        <CustomFieldsEditor
          contactId={contact.id}
          customFields={contact.custom_fields ?? {}}
          onSaved={onContactRefresh}
        />
      )}

      <div className="space-y-2">
        <div className="text-label">Ações</div>
        <Button variant="outline" className="w-full justify-start" onClick={handleTogglePin}>
          {conversation.pinned ? (
            <>
              <PinOff className="h-4 w-4" />
              Desfixar conversa
            </>
          ) : (
            <>
              <Pin className="h-4 w-4" />
              Fixar conversa no topo
            </>
          )}
        </Button>
        {isClosed ? (
          <Button variant="outline" className="w-full justify-start" onClick={handleReopen}>
            <RotateCcw className="h-4 w-4" />
            Reabrir conversa
          </Button>
        ) : (
          <>
            {conversation.ai_paused ? (
              <Button variant="outline" className="w-full justify-start" onClick={handleResume}>
                <Play className="h-4 w-4" />
                Retomar IA
              </Button>
            ) : (
              <Button variant="outline" className="w-full justify-start" onClick={handlePause}>
                <Pause className="h-4 w-4" />
                Pausar IA
              </Button>
            )}
            <Button variant="ghost" className="w-full justify-start" onClick={handleClose}>
              <CircleX className="h-4 w-4 text-[var(--color-error)]" />
              Fechar conversa
            </Button>
          </>
        )}
        <Button variant="ghost" className="w-full justify-start" onClick={handleArchive}>
          {conversation.archived ? (
            <>
              <ArchiveRestore className="h-4 w-4" />
              Desarquivar conversa
            </>
          ) : (
            <>
              <Archive className="h-4 w-4" />
              Arquivar conversa
            </>
          )}
        </Button>
      </div>

      <div className="pt-3 border-t border-[rgba(var(--accent-secondary-rgb),0.08)] text-[10px] text-[var(--color-text-secondary)] opacity-70 space-y-0.5">
        <div>Status: {conversation.status}</div>
        <div>IA: {conversation.ai_paused ? 'pausada' : 'ativa'}</div>
        <div>Criada: {new Date(conversation.created_at).toLocaleString('pt-BR')}</div>
      </div>
    </div>
  );
}
