import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, LifeBuoy, Menu, Send } from 'lucide-react';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { OrgSwitcher } from '@/app/layout/OrgSwitcher';
import { UserMenu } from '@/app/layout/UserMenu';
import { StatusPulse } from '@/components/ui/StatusPulse';
import { useWebjsStatus } from '@/hooks/useWebjsStatus';
import { useAppUser } from '@/app/providers/AppUserProvider';

interface HeaderProps {
  onMenuClick?: () => void;
}

const TODAY_LABEL = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
}).format(new Date());

const SECTION_META: Array<{ match: (path: string) => boolean; eyebrow: string; title: string }> = [
  { match: (path) => path.startsWith('/dashboard'), eyebrow: 'Central de operação', title: 'Visão geral' },
  { match: (path) => path.startsWith('/inbox'), eyebrow: 'Atendimento', title: 'Inbox' },
  { match: (path) => path.startsWith('/vivas-envia'), eyebrow: 'Automação', title: 'Vivas Envia' },
  { match: (path) => path.startsWith('/vivas-perfil'), eyebrow: 'Presença digital', title: 'Vivas Perfil' },
  { match: (path) => path.startsWith('/contacts'), eyebrow: 'Relacionamento', title: 'Contatos' },
  { match: (path) => path.startsWith('/ai-agent'), eyebrow: 'Inteligência', title: 'Agente de IA' },
  { match: (path) => path.startsWith('/ferramentas'), eyebrow: 'Produtividade', title: 'Ferramentas' },
  { match: (path) => path.startsWith('/settings'), eyebrow: 'Preferências', title: 'Configurações' },
  { match: (path) => path.startsWith('/feedback'), eyebrow: 'Experiência', title: 'Feedback' },
  { match: (path) => path.startsWith('/ajuda'), eyebrow: 'Suporte', title: 'Central de ajuda' },
  { match: (path) => path.startsWith('/admin'), eyebrow: 'Administração', title: 'Organizações' },
];

function connectionBadge(status: ReturnType<typeof useWebjsStatus>) {
  if (status === 'ready') return { tone: 'success' as const, label: 'Conectado', title: 'Vivas Envia conectado' };
  if (status === 'connecting') return { tone: 'warning' as const, label: 'Conectando', title: 'Vivas Envia conectando' };
  if (status === 'blocked') return { tone: 'error' as const, label: 'Bloqueado', title: 'Vivas Envia bloqueado temporariamente' };
  return { tone: 'neutral' as const, label: 'Desconectado', title: 'Vivas Envia desconectado' };
}

// Cabeçalho — feedback do dono: ficava "feito de qualquer jeito", vazio,
// sem informação nenhuma além do e-mail. Reconstruído com: (1) status de
// conexão do WhatsApp ao vivo (reaproveita StatusPulse), útil de verdade e
// não só decoração; (2) data por extenso; (3) tudo agrupado numa "pílula"
// de vidro só, com divisores consistentes, em vez de ícones soltos com
// espaço vazio entre eles.
export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const webjsStatus = useWebjsStatus();
  const badge = connectionBadge(webjsStatus);
  const { isSuperAdmin } = useAppUser();
  const section = SECTION_META.find((item) => item.match(location.pathname)) ?? {
    eyebrow: 'Vivas Connect',
    title: 'Painel',
  };

  return (
    <header
      className="app-header shrink-0 flex items-center justify-between gap-3 sm:gap-5"
      role="banner"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="app-header-icon md:hidden h-11 w-11 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="app-header-eyebrow">{section.eyebrow}</div>
          <div className="truncate text-base font-bold tracking-[-0.02em] text-[var(--color-text-primary)] sm:text-lg">
            {section.title}
          </div>
        </div>
      </div>

      <div className="app-header-actions flex min-w-0 items-center gap-1 py-1.5 pl-2 sm:pl-3 pr-1.5">
        <div className="hidden items-center gap-2 px-2 xl:flex">
          <CalendarDays className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          <span className="whitespace-nowrap text-[11px] capitalize text-[var(--color-text-secondary)]">{TODAY_LABEL}</span>
        </div>
        <Divider />
        <div className="hidden items-center gap-2 pr-3 sm:flex" title={badge.title}>
          <Send className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
          <StatusPulse tone={badge.tone} label={badge.label} />
        </div>

        {isSuperAdmin && (
          <>
            <Divider />
            <OrgSwitcher />
          </>
        )}
        <Divider />
        <Link
          to="/ajuda?tab=chat"
          title="Ajuda — tirar dúvidas sobre o sistema"
          aria-label="Ajuda — tirar dúvidas sobre o sistema"
          className="app-header-icon h-9 w-9 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[#A78BFA]"
        >
          <LifeBuoy className="h-4.5 w-4.5" />
        </Link>
        <Divider />
        <NotificationsDropdown />
        <Divider />
        <UserMenu />
      </div>
    </header>
  );
}

function Divider() {
  return <div className="app-header-divider hidden h-6 w-px shrink-0 md:block" />;
}
