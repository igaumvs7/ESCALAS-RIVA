import { useState } from 'react';
import { Check, Info, ChevronDown, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { THEMES, useTheme } from '@/app/providers/ThemeProvider';

// ----------------------------------------------------------------------------
// ThemeSettings — aba "Temas" em Configurações.
// ----------------------------------------------------------------------------
// Só troca a PALETA DE COR do sistema inteiro (fundo, cards, botões, bordas).
// Não muda layout, não muda imagens — é escolha pessoal de quem está usando,
// salva no navegador (ver ThemeProvider.tsx).
// ----------------------------------------------------------------------------

// Aviso + tutorial (pedido do dono): cada tema tem um fundo animado próprio
// na tela de login (ver InteractiveBackground.tsx), mas se o Windows/
// navegador tiver "reduzir movimento" ligado, o fundo aparece só uma cor
// sólida parada — causa raiz real já confirmada nesta mesma conversa. Como
// isso é uma configuração do PRÓPRIO computador (não um bug do sistema),
// avisamos aqui e damos o passo a passo pra ligar de volta.
function AnimatedBackgroundNotice() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[rgba(var(--accent-primary-rgb),0.25)] bg-[rgba(var(--accent-primary-rgb),0.06)] p-4">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
        <p className="text-sm text-[var(--color-text-primary)]">
          Cada tema tem um <strong>fundo animado próprio</strong> na tela de
          login (mexe conforme você move o cursor). Se aparecer só uma cor
          parada, sem nenhuma animação, é o computador que está com os
          efeitos de animação desligados — não é erro do sistema.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:underline"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        Fundo do login não está animando? Veja como ligar
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-text-secondary)]">
          <li>
            Aperte a tecla <strong>Windows</strong> no teclado e clique em{' '}
            <strong>Configurações</strong> (ícone de engrenagem).
          </li>
          <li>
            Clique em <strong>Acessibilidade</strong>, no menu do lado
            esquerdo.
          </li>
          <li>
            Clique em <strong>Efeitos visuais</strong>.
          </li>
          <li>
            Ligue o botão de <strong>Efeitos de animação</strong> (deixe azul
            / "Ativado").
          </li>
          <li>Feche o navegador por completo e abra de novo.</li>
        </ol>
      )}
    </div>
  );
}

export function ThemeSettings() {
  const { theme, savedTheme, previewTheme, commitTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const hasPendingChange = theme !== savedTheme;

  const handleSave = async () => {
    setSaving(true);
    const ok = await commitTheme(theme);
    setSaving(false);
    if (ok) {
      toast.success('Tema salvo — vale em qualquer computador que você entrar.');
    } else {
      toast.error('Não foi possível salvar o tema', {
        description: 'Confira sua conexão e tente de novo.',
      });
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-display mb-1">Temas</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Escolha a paleta de cores do sistema. Clique num tema pra pré-visualizar, depois em{' '}
          <strong>Salvar</strong> pra confirmar — fica valendo na sua conta, em qualquer computador
          que você entrar.
        </p>

        <div className="mb-6">
          <AnimatedBackgroundNotice />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEMES.map((t) => {
            const isActive = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => previewTheme(t.id)}
                className={cn(
                  'text-left rounded-xl border p-4 transition-all',
                  isActive
                    ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-primary-rgb),0.08)]'
                    : 'border-[rgba(var(--accent-secondary-rgb),0.15)] hover:border-[rgba(var(--accent-primary-rgb),0.35)]',
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex -space-x-2">
                    {t.swatch.map((hex, i) => (
                      <span
                        key={i}
                        className="h-7 w-7 rounded-full border-2 border-[var(--color-bg-primary)]"
                        style={{ background: hex }}
                      />
                    ))}
                  </div>
                  {isActive && (
                    <span className="h-5 w-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3" style={{ color: 'var(--color-bg-primary)' }} />
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{t.label}</div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-[rgba(var(--accent-secondary-rgb),0.04)] px-4 py-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {hasPendingChange ? (
              <>Você pré-visualizou um tema novo — clique em Salvar pra confirmar.</>
            ) : (
              <>Nenhuma alteração pendente.</>
            )}
          </p>
          <Button type="button" onClick={handleSave} disabled={!hasPendingChange || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar tema
          </Button>
        </div>
      </Card>
    </div>
  );
}
