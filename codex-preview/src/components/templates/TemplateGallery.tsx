import { useState } from 'react';
import { ArrowLeft, BrainCircuit, Folder, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TEMPLATE_PRESETS, TEMPLATE_PRESET_CATEGORIES, type TemplatePreset } from '@/lib/templatePresets';

interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onPick: (preset: TemplatePreset) => void;
}

// ----------------------------------------------------------------------------
// TemplateGallery — pastinha de modelos prontos (pedido do dono, 2026-08-27):
// clica na pasta (categoria), clica no modelo, vê o texto + a explicação do
// porquê ele funciona (gatilho de psicologia comportamental por trás), e usa
// como ponto de partida no TemplateFormDialog.
// ----------------------------------------------------------------------------
export function TemplateGallery({ open, onClose, onPick }: TemplateGalleryProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [preset, setPreset] = useState<TemplatePreset | null>(null);

  const handleClose = () => {
    setCategory(null);
    setPreset(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Modelos prontos"
      description="Textos testados com gatilhos de psicologia comportamental — escolha uma pasta pra começar."
      widthClass="max-w-3xl"
      opaque
    >
      {!category && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATE_PRESET_CATEGORIES.map((cat) => {
            const count = TEMPLATE_PRESETS.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className="flex flex-col items-center gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] p-5 text-center hover:border-[var(--accent-primary)] hover:bg-[rgba(var(--accent-secondary-rgb),0.06)] transition-colors"
              >
                <Folder className="h-7 w-7 text-[var(--accent-primary)]" />
                <span className="text-sm font-semibold">{cat}</span>
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {count} modelo{count !== 1 ? 's' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {category && !preset && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar pras pastas
          </button>
          <div className="text-label">{category}</div>
          <div className="space-y-2">
            {TEMPLATE_PRESETS.filter((p) => p.category === category).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p)}
                className="w-full text-left rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] p-3.5 hover:border-[var(--accent-primary)] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="shrink-0 rounded-full bg-[rgba(139,92,246,0.12)] text-[#A78BFA] text-[10px] font-semibold px-2 py-0.5">
                    {p.principle}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-1">{p.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {preset && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setPreset(null)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar pra lista
          </button>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold">{preset.name}</h3>
              <span
                className={cn(
                  'shrink-0 rounded-full bg-[rgba(139,92,246,0.12)] text-[#A78BFA] text-[10px] font-semibold px-2 py-0.5',
                )}
              >
                {preset.principle}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.03] p-4">
            <MessageSquareText className="h-4 w-4 text-[var(--accent-primary)] flex-shrink-0 mt-0.5" />
            <p className="text-sm font-mono whitespace-pre-wrap">{preset.body}</p>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.05)] p-4">
            <BrainCircuit className="h-4 w-4 text-[#A78BFA] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-[#A78BFA]">Por que funciona</p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">{preset.why}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                onPick(preset);
                handleClose();
              }}
            >
              Usar esse modelo
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
