import { useEffect, useRef, useState } from 'react';
import { Pencil, Pin, Trash2, X, Check, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ----------------------------------------------------------------------------
// PinnedNoteBar — a "nota fixa" da conversa, logo abaixo do nome do contato.
// ----------------------------------------------------------------------------
// Pedido do dono (2026-09-04): "a nota ficasse em um canto separado e onde eu
// mexesse na conversa eu queria que as notas ficassem em destaque, poderia ser
// embaixo do nome; e um lápis, ao clicar ter a opção de excluir ou editar".
//
// Antes: a nota só dava pra editar no painel lateral de detalhes (que fica
// escondido em tela menor) e aparecia aqui só como texto, sem ação nenhuma.
// Agora: ela é editável no lugar onde é lida, com lápis -> editar / excluir.
//
// A nota é `conversations.pinned_note` (uma por conversa) e chega sempre pelo
// realtime da tabela conversations -- então o que está na tela é o valor do
// banco, e edição feita em outro aparelho/aba aparece aqui sozinha.
// ----------------------------------------------------------------------------

interface PinnedNoteBarProps {
  note: string | null;
  onSave: (note: string) => Promise<void>;
}

export function PinnedNoteBar({ note, onSave }: PinnedNoteBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Enquanto NÃO está editando, o rascunho segue o valor do banco -- assim uma
  // alteração vinda do realtime (outra aba/aparelho) aparece na hora. Durante
  // a edição não mexemos, pra não apagar o que está sendo digitado.
  useEffect(() => {
    if (!editing) setDraft(note ?? '');
  }, [note, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = async (value: string, successMsg: string) => {
    setSaving(true);
    try {
      await onSave(value);
      setEditing(false);
      toast.success(successMsg);
    } catch (err) {
      toast.error('Não foi possível salvar a nota', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed === (note ?? '').trim()) {
      setEditing(false);
      return;
    }
    void commit(trimmed, trimmed ? 'Nota salva.' : 'Nota removida.');
  };

  const handleDelete = () => void commit('', 'Nota removida.');

  const cancel = () => {
    setDraft(note ?? '');
    setEditing(false);
  };

  // ---- Modo edição --------------------------------------------------------
  if (editing) {
    return (
      <div className="border-b border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] px-4 py-2.5">
        <div className="flex items-start gap-2">
          <Pin className="h-3.5 w-3.5 mt-2 shrink-0 text-[#FBBF24]" />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter salva (nota costuma ser curta); Shift+Enter quebra linha.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') cancel();
            }}
            rows={2}
            disabled={saving}
            placeholder="Escreva uma nota fixa desta conversa..."
            className="flex-1 resize-none rounded-lg border border-[rgba(245,158,11,0.3)] bg-[var(--color-bg-primary)]/40 px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[#FBBF24] disabled:opacity-60"
          />
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-label="Salvar nota"
              title="Salvar (Enter)"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#FBBF24] hover:bg-[rgba(245,158,11,0.15)] disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              aria-label="Cancelar edição da nota"
              title="Cancelar (Esc)"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Sem nota: botão discreto pra criar ---------------------------------
  if (!note?.trim()) {
    return (
      <div className="border-b border-[rgba(var(--accent-secondary-rgb),0.08)] px-4 py-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] hover:text-[#FBBF24] transition-colors"
        >
          <Plus className="h-3 w-3" />
          Adicionar nota fixa
        </button>
      </div>
    );
  }

  // ---- Nota existente: em destaque, com lápis e lixeira -------------------
  return (
    <div
      className={cn(
        'group flex items-start gap-2 border-b px-4 py-2 text-sm',
        'border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)]',
      )}
    >
      <Pin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#FBBF24]" />
      <span className="flex-1 whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
        {note}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Editar nota"
          title="Editar nota"
          className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[rgba(245,158,11,0.15)] hover:text-[#FBBF24] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          aria-label="Excluir nota"
          title="Excluir nota"
          className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-error)]/15 hover:text-[var(--color-error)] disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
