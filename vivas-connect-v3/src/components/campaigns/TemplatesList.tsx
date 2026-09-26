import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Folder, MessageSquareText, Pencil, Plus, Shuffle, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useTemplates } from '@/hooks/useTemplates';
import { TemplateFormDialog } from '@/components/templates/TemplateFormDialog';
import { TemplateGallery } from '@/components/templates/TemplateGallery';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { TEMPLATE_PRESETS, TEMPLATE_PRESET_CATEGORIES, type TemplatePreset } from '@/lib/templatePresets';
import { splitVariants } from '@/lib/messageVariants';
import { cn } from '@/lib/utils';
import type { Template } from '@/types/templates';

// ----------------------------------------------------------------------------
// TemplatesList — pedido do dono (2026-08-27): "eu quero que já apareçam,
// todos aqui pra mim... como uma pasta, cada um com sua pastinha separada...
// clico e vai me dando o que é cada um... explique sobre as variáveis...
// deixar tudo predefinido pro cliente não ter o trabalho de fazer tudo".
//
// Os 8 modelos prontos (templatePresets.ts) já entram como templates DE
// VERDADE assim que a org não tem nenhum (useTemplates.ts::seedPresetTemplates)
// — aparecem aqui organizados em pastas por categoria, sem precisar abrir
// nenhuma galeria à parte. "Usar um modelo pronto" continua existindo só pra
// quem apagou um preset e quer recolocar, ou quer uma cópia extra.
// ----------------------------------------------------------------------------

const presetById = new Map<string, TemplatePreset>(TEMPLATE_PRESETS.map((p) => [p.id, p]));
const OTHER_FOLDER = 'Meus templates';

function groupByFolder(templates: Template[]): Array<[string, Template[]]> {
  const groups = new Map<string, Template[]>();
  for (const cat of TEMPLATE_PRESET_CATEGORIES) groups.set(cat, []);
  for (const t of templates) {
    const cat = presetById.get(t.name)?.category ?? OTHER_FOLDER;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(t);
  }
  return Array.from(groups.entries()).filter(([, list]) => list.length > 0);
}

export function TemplatesList() {
  const { templates, loading, error, remove, reload } = useTemplates();
  const [showForm, setShowForm] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [prefill, setPrefill] = useState<TemplatePreset | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  const folders = useMemo(() => groupByFolder(templates), [templates]);
  const confirm = useConfirm();

  const handleDelete = async (t: Template) => {
    const ok = await confirm({
      title: 'Remover template',
      description: `Remover o template "${t.name}"? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    setDeleting(t.id);
    try {
      await remove(t.id);
      toast.success(`Template "${t.name}" removido.`);
    } catch (err) {
      toast.error('Falha ao remover template', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {templates.length} template{templates.length !== 1 ? 's' : ''} — já vêm alguns prontos pra usar
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowGallery(true)}>
            <Sparkles className="h-4 w-4" />
            Recolocar um modelo pronto
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setPrefill(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo template
          </Button>
        </div>
      </div>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading ? (
        <Card>
          <div className="py-8 text-center text-[var(--color-text-secondary)] opacity-60">Carregando...</div>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-[var(--color-text-secondary)] opacity-60">
            Nenhum template ainda.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {folders.map(([folder, list]) => {
            const isFolderOpen = openFolder === folder;
            return (
              <Card key={folder}>
                <button
                  type="button"
                  onClick={() => setOpenFolder(isFolderOpen ? null : folder)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Folder className="h-4 w-4 text-[var(--accent-primary)]" />
                    <span className="text-sm font-bold">{folder}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                      {list.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn('h-4 w-4 text-[var(--color-text-secondary)] transition-transform', isFolderOpen && 'rotate-180')}
                  />
                </button>

                {isFolderOpen && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-[rgba(var(--accent-secondary-rgb),0.08)]">
                    {list.map((t) => {
                      const preset = presetById.get(t.name);
                      const isOpen = openTemplateId === t.id;
                      const variants = splitVariants(t.body);
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02] p-3"
                        >
                          <button
                            type="button"
                            onClick={() => setOpenTemplateId(isOpen ? null : t.id)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold font-mono text-[var(--color-text-primary)]">
                                  {preset?.name ?? t.name}
                                </span>
                                {variants.length > 1 && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(139,92,246,0.12)] text-[#A78BFA] text-[10px] font-semibold px-2 py-0.5">
                                    <Shuffle className="h-2.5 w-2.5" />
                                    {variants.length} variações
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronDown
                              className={cn('h-3.5 w-3.5 text-[var(--color-text-secondary)] transition-transform flex-shrink-0', isOpen && 'rotate-180')}
                            />
                          </button>

                          {isOpen && (
                            <div className="mt-3 space-y-3 pt-3 border-t border-[rgba(var(--accent-secondary-rgb),0.08)]">
                              {variants.map((v, i) => (
                                <div key={i} className="flex items-start gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-black/10 p-3">
                                  <MessageSquareText className="h-3.5 w-3.5 text-[var(--accent-primary)] flex-shrink-0 mt-0.5" />
                                  <p className="text-xs font-mono whitespace-pre-wrap text-[var(--color-text-secondary)]">
                                    {variants.length > 1 ? `Variação ${i + 1}: ` : ''}
                                    {v}
                                  </p>
                                </div>
                              ))}

                              {Object.keys(t.variables ?? {}).length > 0 && (
                                <div className="space-y-1.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] p-3">
                                  <p className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                                    O que cada variável significa
                                  </p>
                                  {Object.entries(t.variables).map(([key, desc]) => (
                                    <div key={key} className="flex items-start gap-2 text-xs">
                                      <span className="font-mono text-[var(--accent-secondary)] shrink-0">{`{{${key}}}`}</span>
                                      <span className="text-[var(--color-text-secondary)]">{String(desc) || '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {preset && (
                                <div className="flex items-start gap-2 rounded-lg border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.05)] p-3">
                                  <Sparkles className="h-3.5 w-3.5 text-[#A78BFA] flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[11px] font-semibold text-[#A78BFA]">{preset.principle}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{preset.why}</p>
                                  </div>
                                </div>
                              )}

                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditing(t);
                                    setShowForm(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(t)}
                                  disabled={deleting === t.id}
                                  aria-label={`Remover ${t.name}`}
                                >
                                  {deleting === t.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5 text-[var(--color-error)]" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <TemplateGallery
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onPick={(preset) => {
          setEditing(null);
          setPrefill(preset);
          setShowForm(true);
        }}
      />

      <TemplateFormDialog
        open={showForm}
        template={editing}
        initialName={prefill?.id}
        initialBody={prefill?.body}
        onClose={() => setShowForm(false)}
        onSaved={reload}
      />
    </div>
  );
}
