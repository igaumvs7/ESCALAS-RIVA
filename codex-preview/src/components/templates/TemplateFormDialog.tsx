import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { getSupabase } from '@/lib/supabase';
import { useTemplates } from '@/hooks/useTemplates';
import { extractVariables, type Template } from '@/types/templates';
import { joinVariants, splitVariants } from '@/lib/messageVariants';
import { MessageVariantsEditor } from '@/components/vivas-envia/MessageVariantsEditor';

// ----------------------------------------------------------------------------
// TemplateFormDialog — simplificado pro mundo webjs (Baileys).
// ----------------------------------------------------------------------------
// Categoria Meta (marketing/utility/authentication), header de mídia, footer
// e botões existiam pro fluxo de aprovação da Meta via Zernio — sem Zernio,
// nada disso tem efeito (o worker manda texto puro via
// campaignWorker.js::sendToContact). Removidos da tela; os campos continuam
// existindo no banco com valores padrão neutros, só não aparecem mais aqui.
// ----------------------------------------------------------------------------

interface TemplateFormDialogProps {
  open: boolean;
  onClose: () => void;
  template?: Template | null;
  onSaved?: () => void;
  // Pré-preenche nome/corpo ao criar (não se aplica em edição) — usado pelo
  // TemplateGallery quando o usuário escolhe um modelo pronto.
  initialName?: string;
  initialBody?: string;
}

const NAME_RULE = /^[a-z0-9_]+$/;

export function TemplateFormDialog({
  open,
  onClose,
  template,
  onSaved,
  initialName,
  initialBody,
}: TemplateFormDialogProps) {
  const { create, update } = useTemplates();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [variants, setVariants] = useState<string[]>(['']);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(template);
  const body = useMemo(() => joinVariants(variants), [variants]);
  const detectedVars = useMemo(() => extractVariables(body), [body]);
  const [varExamples, setVarExamples] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? initialName ?? '');
    setVarExamples((template?.variables as Record<string, string> | null) ?? {});
    setLanguage(template?.language ?? 'pt_BR');
    setVariants(splitVariants(template?.body ?? initialBody ?? 'Oi {{1}}! '));
    setAiPrompt(template?.ai_prompt ?? '');
  }, [open, template, initialName, initialBody]);

  const handleGenerate = async () => {
    if (aiPrompt.trim().length < 10) {
      toast.error('Descreva o objetivo da mensagem (mínimo 10 caracteres).');
      return;
    }
    setGenerating(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('generate-template', {
      body: { language, objective: aiPrompt },
    });
    setGenerating(false);

    if (error || !data?.ok) {
      toast.error('Falha na geração', {
        description: data?.error ?? error?.message ?? 'Erro desconhecido',
      });
      return;
    }
    const gen = data.template as { body: string };
    setVariants([gen.body ?? '']);
    toast.success(`Gerado (${data.model}) — revise antes de salvar.`);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!NAME_RULE.test(name)) {
      toast.error('Nome inválido', {
        description: 'Use apenas letras minúsculas, números e underscore.',
      });
      return;
    }
    if (body.trim().length === 0) {
      toast.error('A mensagem não pode ficar vazia.');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      // Campos legados do fluxo Meta/Zernio — mantidos com valor neutro
      // porque a coluna ainda existe no banco, mas não aparecem mais na tela.
      category: 'utility' as const,
      language,
      header_type: 'none' as const,
      header_content: null,
      body,
      footer: null,
      buttons: [],
      variables: Object.fromEntries(
        detectedVars.map((i) => [String(i), (varExamples[String(i)] ?? '').trim()]),
      ),
      ai_prompt: aiPrompt.trim() || null,
    };
    if (isEdit && template) {
      await update(template.id, payload);
    } else {
      await create(payload);
    }
    setSaving(false);
    toast.success(isEdit ? 'Mensagem atualizada.' : 'Mensagem salva.');
    onSaved?.();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar mensagem' : 'Nova mensagem'}
      widthClass="max-w-2xl"
      opaque
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* -- IA Generator -- */}
        <div className="rounded-lg border border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.05)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#A78BFA]" />
            <span className="text-sm font-semibold">Gerar com IA</span>
            <span className="text-xs text-[var(--color-text-secondary)] opacity-70">
              preenche o texto com base no objetivo
            </span>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Ex: Mensagem convidando o lead a agendar uma visita ao imóvel"
            rows={2}
            className="w-full rounded-lg border border-[rgba(139,92,246,0.2)] bg-white/[0.03] px-4 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[#A78BFA]"
            disabled={generating || saving}
          />
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerate}
              disabled={generating || saving}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tpl_name">Nome (identificador interno)</Label>
            <Input
              id="tpl_name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="boas_vindas_cliente"
              disabled={saving || isEdit}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl_lang">Idioma</Label>
            <Input
              id="tpl_lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mensagem</Label>
          <MessageVariantsEditor variants={variants} onChange={setVariants} disabled={saving} />
        </div>

        {detectedVars.length > 0 && (
          <div className="space-y-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.02] p-3">
            <div className="text-xs font-semibold text-[var(--color-text-primary)]">
              O que cada variável representa
            </div>
            {detectedVars.map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-xs text-[var(--accent-secondary)]">{`{{${i}}}`}</span>
                <Input
                  value={varExamples[String(i)] ?? ''}
                  onChange={(e) => setVarExamples((cur) => ({ ...cur, [String(i)]: e.target.value }))}
                  placeholder={`Ex.: nome do contato`}
                  disabled={saving}
                />
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)] opacity-80">
              Em campanhas, cada variável pode ser o nome do contato (personalizado por
              destinatário) ou um valor fixo igual para todos — você escolhe ao criar a
              campanha.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : isEdit ? (
              <>Salvar alterações</>
            ) : (
              <>Salvar</>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
