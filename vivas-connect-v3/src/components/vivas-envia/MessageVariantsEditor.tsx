import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bold, Folder, Italic, Loader2, Plus, Shuffle, Sparkles, Strikethrough, Trash2, UserCheck } from 'lucide-react';
import { extractVariables } from '@/types/templates';
import { MAX_VARIANTS } from '@/lib/messageVariants';
import { splitVariants } from '@/lib/messageVariants';
import { getSupabase } from '@/lib/supabase';
import { useTemplates } from '@/hooks/useTemplates';
import { TEMPLATE_PRESETS } from '@/lib/templatePresets';
import { cn } from '@/lib/utils';
import type { Template } from '@/types/templates';

interface MessageVariantsEditorProps {
  variants: string[];
  onChange: (variants: string[]) => void;
  disabled?: boolean;
}

const presetById = new Map(TEMPLATE_PRESETS.map((p) => [p.id, p]));
const OTHER_FOLDER = 'Meus templates';

function folderOf(t: Template): string {
  return presetById.get(t.name)?.category ?? OTHER_FOLDER;
}

function displayName(t: Template): string {
  return presetById.get(t.name)?.name ?? t.name;
}

// Toggle de verdade — antes só ADICIONAVA marcador a cada clique (bug
// relatado pelo dono: cliques repetidos empilhavam `*` infinitamente).
// Agora detecta se a seleção (ou o que está IMEDIATAMENTE ao redor dela) já
// está marcada e remove nesse caso, em vez de sempre embrulhar de novo.
function toggleWrap(el: HTMLTextAreaElement | null, value: string, marker: string, set: (v: string) => void) {
  if (!el) return;
  const { selectionStart: start, selectionEnd: end } = el;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Caso 1: a própria seleção inclui os marcadores (ex.: selecionou "*texto*").
  if (selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    set(before + inner + after);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + inner.length);
    });
    return;
  }

  // Caso 2: a seleção está POR DENTRO dos marcadores (ex.: selecionou só
  // "texto" dentro de "*texto*") — remove os marcadores ao redor.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const newBefore = before.slice(0, before.length - marker.length);
    const newAfter = after.slice(marker.length);
    set(newBefore + selected + newAfter);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newBefore.length, newBefore.length + selected.length);
    });
    return;
  }

  // Caso 3: não está marcado ainda — embrulha (liga a formatação).
  const toWrap = selected || 'texto';
  set(before + marker + toWrap + marker + after);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + marker.length, start + marker.length + toWrap.length);
  });
}

const NAME_VAR_RE = /\{\{\s*1\s*\}\}/;

function hasNameVar(text: string): boolean {
  return NAME_VAR_RE.test(text);
}

// Insere um cumprimento com o nome no INÍCIO — cabe naturalmente em
// qualquer mensagem, sem precisar entender o resto da frase.
function insertNameVar(text: string): string {
  return text.trim() ? `Oi {{1}}! ${text}` : 'Oi {{1}}! ';
}

function removeNameVar(text: string): string {
  return text
    .replace(new RegExp(NAME_VAR_RE, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ ,!.]+/, '')
    .trim();
}

// ----------------------------------------------------------------------------
// MessageVariantsEditor — até 5 textos que se alternam de forma ALEATÓRIA a
// cada envio (pedido do dono, 2026-08-27), usado tanto no Disparo rápido
// quanto na criação de Templates. Cada variação tem:
// - Formatação (negrito/itálico/tachado — sintaxe real do WhatsApp: *_~),
//   agora com toggle de verdade (liga/desliga), não só adiciona;
// - Pasta de templates: puxa o texto pronto de um template existente pra
//   dentro dessa variação específica — pedido do dono (2026-08-27): "em
//   cada mensagem, um botão de pasta que puxa o texto pronto do templates".
//   É só ATALHO de leitura — a gestão completa (criar/editar/apagar)
//   continua na aba própria de Templates, não mais dentro do Disparador.
// - "Citar o nome do contato": checkbox que insere/remove {{1}};
// - "Corrigir com IA": revisa ortografia/organiza a ideia sem mudar
//   sentido nem mexer nas variáveis (Edge Function fix-message-text).
// ----------------------------------------------------------------------------
export function MessageVariantsEditor({ variants, onChange, disabled }: MessageVariantsEditorProps) {
  const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const { templates } = useTemplates();

  const folders = useMemo(() => {
    const groups = new Map<string, Template[]>();
    for (const t of templates) {
      const f = folderOf(t);
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f)!.push(t);
    }
    return Array.from(groups.entries());
  }, [templates]);

  const setVariant = (i: number, value: string) => {
    const next = [...variants];
    next[i] = value;
    onChange(next);
  };

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) return;
    onChange([...variants, 'Oi {{1}}! ']);
  };

  const removeVariant = (i: number) => {
    if (variants.length <= 1) return;
    onChange(variants.filter((_, idx) => idx !== i));
  };

  const toggleNameVar = (i: number) => {
    const text = variants[i];
    setVariant(i, hasNameVar(text) ? removeNameVar(text) : insertNameVar(text));
  };

  const pickTemplate = (i: number, t: Template) => {
    // Um template pode ter várias variações próprias ({a|b|c}) — pega só a
    // primeira pra colar aqui, é só ponto de partida, o usuário edita depois.
    const [firstVariant] = splitVariants(t.body);
    setVariant(i, firstVariant ?? t.body);
    setPickerIndex(null);
  };

  const fixWithAI = async (i: number) => {
    const text = variants[i].trim();
    if (!text) return;
    setFixingIndex(i);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('fix-message-text', { body: { text } });
    setFixingIndex(null);
    if (error || !data?.ok) {
      toast.error('Não foi possível corrigir agora', {
        description: data?.error ?? error?.message ?? 'Erro desconhecido',
      });
      return;
    }
    setVariant(i, data.text as string);
    toast.success('Texto corrigido — revise antes de enviar.');
  };

  return (
    <div className="space-y-3">
      {variants.length > 1 && (
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.05)] px-3 py-2 text-xs text-[#A78BFA]">
          <Shuffle className="h-3.5 w-3.5 flex-shrink-0" />
          Essas {variants.length} variações vão se alternar de forma totalmente aleatória a cada
          envio — nunca a mesma ordem, nunca previsível.
        </div>
      )}

      {variants.map((text, i) => {
        const citesName = hasNameVar(text);
        const isFixing = fixingIndex === i;
        const isPickerOpen = pickerIndex === i;
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                {variants.length > 1 ? `Variação ${i + 1}` : 'Mensagem'}
              </span>
              <div className="flex items-center gap-1 relative">
                <button
                  type="button"
                  onClick={() => setPickerIndex(isPickerOpen ? null : i)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--accent-primary)]"
                  title="Puxar texto pronto de um template"
                  disabled={disabled}
                >
                  <Folder className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleWrap(refs.current[i], text, '*', (v) => setVariant(i, v))}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  title="Negrito"
                  disabled={disabled}
                >
                  <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleWrap(refs.current[i], text, '_', (v) => setVariant(i, v))}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  title="Itálico"
                  disabled={disabled}
                >
                  <Italic className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleWrap(refs.current[i], text, '~', (v) => setVariant(i, v))}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                  title="Tachado"
                  disabled={disabled}
                >
                  <Strikethrough className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void fixWithAI(i)}
                  disabled={disabled || isFixing || !text.trim()}
                  className="flex items-center gap-1 rounded-md border border-[rgba(139,92,246,0.3)] px-2 py-1 text-[10px] text-[#A78BFA] hover:border-[#A78BFA] disabled:opacity-50"
                  title="Corrigir ortografia e organizar a frase com IA"
                >
                  {isFixing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Corrigir com IA
                </button>
                {variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.1)]"
                    title="Remover essa variação"
                    disabled={disabled}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {isPickerOpen && (
                  <div className="absolute right-0 top-8 z-20 w-72 max-h-80 overflow-y-auto rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-[var(--color-bg-primary)] shadow-2xl p-2 space-y-2">
                    {folders.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-secondary)] p-2">
                        Nenhum template ainda.
                      </p>
                    ) : (
                      folders.map(([folder, list]) => (
                        <div key={folder}>
                          <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                            <Folder className="h-3 w-3" />
                            {folder}
                          </div>
                          {list.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => pickTemplate(i, t)}
                              className="block w-full text-left px-2 py-1.5 rounded-md text-xs text-[var(--color-text-primary)] hover:bg-[rgba(var(--accent-secondary-rgb),0.12)] truncate"
                            >
                              {displayName(t)}
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <textarea
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={text}
              onChange={(e) => setVariant(i, e.target.value)}
              placeholder="Escreva a mensagem..."
              rows={4}
              disabled={disabled || isFixing}
              className={cn(
                'w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]',
              )}
            />
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={citesName}
                onChange={() => toggleNameVar(i)}
                disabled={disabled}
                className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
              />
              <UserCheck className="h-3 w-3" />
              Citar o nome do contato nesta mensagem
              {extractVariables(text).length > 1 && (
                <span className="opacity-70">— outras variáveis também viram o nome automaticamente.</span>
              )}
            </label>
          </div>
        );
      })}

      {variants.length < MAX_VARIANTS && (
        <button
          type="button"
          onClick={addVariant}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar variação de texto ({variants.length}/{MAX_VARIANTS})
        </button>
      )}
    </div>
  );
}
