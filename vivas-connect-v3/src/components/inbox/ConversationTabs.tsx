import { Archive, CircleX, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusBucket } from './inbox-filters';

// 3 tipos de chat, como abas — pedido do dono (2026-09-05): "precisamos dos
// 3 tipos de chat (chat normal de atendimento, chat de conversas fechadas e
// chat de arquivados)". Antes "arquivadas" só existia escondida dentro do
// popover de Filtros, junto de "abertas"/"fechadas" como checkbox.
//
// Reescrito (2026-09-06, feedback "tá mal feito, corta"): com as 3 abas
// mostrando ícone+texto+contador ao mesmo tempo, numa coluna de ~300px não
// cabia — "Arquivadas" ficava cortada, só o ícone sobrava visível. Só a aba
// ATIVA mostra o texto completo; as outras encolhem pra ícone + contador,
// com o nome no title (tooltip). Sempre cabe, sem cortar nada.
// Rótulo da 1ª aba encurtado pra "Ativas" (2026-09-06) — "Em atendimento"
// não cabia nem no modo ativo/expandido da coluna de 300px, cortava pra
// "Em aten...". O nome completo continua no title (tooltip).
const TABS: { v: StatusBucket; label: string; title: string; icon: typeof MessagesSquare }[] = [
  { v: 'abertas', label: 'Ativas', title: 'Em atendimento', icon: MessagesSquare },
  { v: 'fechadas', label: 'Fechadas', title: 'Fechadas', icon: CircleX },
  { v: 'arquivadas', label: 'Arquivadas', title: 'Arquivadas', icon: Archive },
];

export function ConversationTabs({
  active,
  counts,
  onChange,
}: {
  active: StatusBucket;
  counts: Record<StatusBucket, number>;
  onChange: (next: StatusBucket) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.v === active;
        return (
          <button
            key={t.v}
            type="button"
            onClick={() => onChange(t.v)}
            title={t.title}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors',
              isActive ? 'flex-[2] px-2.5' : 'flex-1 px-1.5',
              isActive
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {isActive && <span className="truncate">{t.label}</span>}
            {counts[t.v] > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-[10px] font-bold',
                  isActive ? 'bg-black/15' : 'bg-white/10',
                )}
              >
                {counts[t.v]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
