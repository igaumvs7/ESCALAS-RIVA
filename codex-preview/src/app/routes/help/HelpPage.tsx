import { useSearchParams } from 'react-router-dom';
import { HelpCircle, ListChecks, BookOpen, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnboardingChecklist } from '@/components/help/OnboardingChecklist';
import { HelpDocs } from '@/components/help/HelpDocs';
import { HelpChatPanel } from '@/components/help/HelpChatPanel';

// ----------------------------------------------------------------------------
// HelpPage — pedido do dono (2026-08-27): "uma aba de ajuda/informações...
// tutorial inicial... e um chat com IA pra tirar dúvidas". Item da sidebar
// visível pra qualquer membro (admin ou operador) — ajuda não é recurso
// administrativo.
// ----------------------------------------------------------------------------
type TabId = 'primeiros_passos' | 'central' | 'chat';

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'primeiros_passos', label: 'Primeiros passos', icon: ListChecks, render: () => <OnboardingChecklist /> },
  { id: 'central', label: 'Central de ajuda', icon: BookOpen, render: () => <HelpDocs /> },
  { id: 'chat', label: 'Falar com a IA', icon: MessageCircle, render: () => <HelpChatPanel /> },
];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export default function HelpPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const active: TabId = isTabId(raw) ? raw : 'primeiros_passos';
  const current = TABS.find((t) => t.id === active) ?? TABS[0];

  const selectTab = (id: TabId) => {
    setParams(id === 'primeiros_passos' ? {} : { tab: id }, { replace: true });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <HelpCircle className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Ajuda</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Tutorial inicial, explicação de cada parte do sistema, e um assistente pra tirar dúvidas
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>{current.render()}</div>
    </div>
  );
}
