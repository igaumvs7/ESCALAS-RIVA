import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Gauge, Loader2, Scale, Rocket, Send, Upload, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useTags } from '@/hooks/useTags';
import { useTemplates } from '@/hooks/useTemplates';
import { useDispatchSettings } from '@/hooks/useDispatchSettings';
import { extractVariables } from '@/types/templates';
import { joinVariants } from '@/lib/messageVariants';
import { MessageVariantsEditor } from '@/components/vivas-envia/MessageVariantsEditor';
import { ImportContactsDialog } from '@/components/contacts/ImportContactsDialog';
import { cn } from '@/lib/utils';
import type { AudienceFilter, VariableSource } from '@/types/campaigns';

// ----------------------------------------------------------------------------
// QuickSendCard — layout direto e simples pedido pelo dono (2026-08-27):
// uma tela só, sem wizard de passos, pra escrever a mensagem e disparar.
// Suporta até 5 variações de texto que se alternam ALEATORIAMENTE a cada
// envio (via spintax `{a|b|c}`, motor que já existia no worker — ver
// src/lib/messageVariants.ts). Por baixo, ainda cria um template (a tabela
// `campaigns` exige um) e chama o mesmo `createAndQueue` do wizard — 100%
// escondido do usuário. A campanha avançada (agendar, campo customizado)
// continua disponível como "Disparo avançado" na lista abaixo.
// ----------------------------------------------------------------------------

const MODE_ICON = { safe: Gauge, moderate: Scale, risky: Rocket, manual: Scale } as const;
const MODE_LABEL = { safe: 'Seguro', moderate: 'Moderado', risky: 'Arriscado', manual: 'Manual' } as const;

export function QuickSendCard() {
  const { previewAudience, createAndQueue } = useCampaigns();
  const { tags } = useTags();
  const { create: createTemplate } = useTemplates();
  const { settings: dispatchSettings } = useDispatchSettings();

  const [variants, setVariants] = useState<string[]>(['Oi {{1}}! ']);
  const [audienceMode, setAudienceMode] = useState<'all' | 'tags' | 'upload'>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [uploadedContactIds, setUploadedContactIds] = useState<string[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number } | null>(null);

  const filter: AudienceFilter = useMemo(() => {
    if (audienceMode === 'all') return { all: true };
    if (audienceMode === 'upload') return { contact_ids: uploadedContactIds };
    return { tag_ids: Array.from(selectedTagIds) };
  }, [audienceMode, selectedTagIds, uploadedContactIds]);

  useEffect(() => {
    const t = setTimeout(() => {
      void previewAudience(filter).then(setAudienceCount);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceMode, selectedTagIds, uploadedContactIds]);

  const hasContent = variants.some((v) => v.trim().length > 0);
  const canSend = hasContent && (audienceCount ?? 0) > 0 && !sending;

  const ModeIcon = MODE_ICON[dispatchSettings.mode];

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const body = joinVariants(variants);
      const varIndexes = extractVariables(body);
      const variables = Object.fromEntries(varIndexes.map((i) => [i, 'nome do contato']));

      const template = await createTemplate({
        name: `disparo_rapido_${Date.now()}`,
        category: 'utility',
        language: 'pt_BR',
        header_type: 'none',
        header_content: null,
        body,
        footer: null,
        buttons: [],
        variables,
        ai_prompt: null,
      });
      if (!template) throw new Error('Falha ao preparar a mensagem.');

      const variableMapping: Record<string, VariableSource> = {};
      for (const i of varIndexes) {
        variableMapping[i] = { source: 'contact_field', field: 'name', fallback: 'Cliente' };
      }

      const result = await createAndQueue({
        name: `Disparo rápido — ${new Date().toLocaleString('pt-BR')}`,
        template_id: template.id,
        audience_filter: filter,
        variable_mapping: variableMapping,
        scheduled_at: null,
        channel_id: null,
      });
      if (result) {
        toast.success(`Disparo iniciado para ${result.queued} contato${result.queued === 1 ? '' : 's'}.`);
        setLastResult({ sent: result.queued });
        setVariants(['Oi {{1}}! ']);
        setSelectedTagIds(new Set());
        setUploadedContactIds([]);
        setAudienceMode('all');
      }
    } catch (err) {
      toast.error('Falha ao disparar', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold">Disparador de mensagens em massa</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Escreva a mensagem (ou várias, pra alternar), escolha pra quem, e mande.
            </p>
          </div>
          <Link
            to="/vivas-envia?tab=seguranca"
            className="flex items-center gap-1.5 rounded-full border border-[rgba(var(--accent-secondary-rgb),0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--color-text-primary)]"
          >
            <ModeIcon className="h-3.5 w-3.5" />
            Ritmo: {MODE_LABEL[dispatchSettings.mode]} ({dispatchSettings.daily_limit}/dia)
          </Link>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setAudienceMode('all')}
            className={cn(
              'p-2.5 rounded-lg border text-sm font-medium transition-colors',
              audienceMode === 'all'
                ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.08)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] text-[var(--color-text-secondary)]',
            )}
          >
            Todos os contatos
          </button>
          <button
            type="button"
            onClick={() => setAudienceMode('tags')}
            className={cn(
              'p-2.5 rounded-lg border text-sm font-medium transition-colors',
              audienceMode === 'tags'
                ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.08)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] text-[var(--color-text-secondary)]',
            )}
          >
            Por tag
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className={cn(
              'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-sm font-medium transition-colors',
              audienceMode === 'upload'
                ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.08)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] text-[var(--color-text-secondary)]',
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            Subir lista
          </button>
          <div className="col-span-2 sm:col-span-1 flex items-center justify-center rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-[rgba(var(--accent-secondary-rgb),0.04)] px-3 text-sm">
            <span className="text-[var(--color-text-secondary)] mr-1.5">Alcança:</span>
            <strong>{audienceCount ?? '…'}</strong>
          </div>
        </div>

        {audienceMode === 'upload' && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] px-3 py-2">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Lista enviada: <strong className="text-[var(--color-text-primary)]">{uploadedContactIds.length} contatos</strong> (nomes e números repetidos já foram ignorados automaticamente).
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowUpload(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Trocar lista
            </Button>
          </div>
        )}

        {audienceMode === 'tags' && (
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && (
              <p className="text-xs text-[var(--color-text-secondary)] opacity-70">Nenhuma tag criada ainda.</p>
            )}
            {tags.map((t) => {
              const active = selectedTagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setSelectedTagIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.id)) next.delete(t.id);
                      else next.add(t.id);
                      return next;
                    })
                  }
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs',
                    active ? 'bg-white/10 text-[var(--color-text-primary)]' : 'bg-white/[0.03] text-[var(--color-text-secondary)]',
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        <MessageVariantsEditor variants={variants} onChange={setVariants} disabled={sending} />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {lastResult ? (
              <>Última operação: <strong className="text-[var(--color-success)]">Enviados {lastResult.sent}</strong></>
            ) : (
              'Nenhum disparo ainda nesta sessão.'
            )}
          </p>
          <Button type="button" onClick={handleSend} disabled={!canSend}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar agora
          </Button>
        </div>
      </div>

      <ImportContactsDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onDone={(contactIds) => {
          setUploadedContactIds(contactIds);
          setAudienceMode('upload');
          setShowUpload(false);
        }}
      />
    </Card>
  );
}

