import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { OrgSwitcher } from '@/app/layout/OrgSwitcher';
import { UserMenu } from '@/app/layout/UserMenu';
import { StatusPulse } from '@/components/ui/StatusPulse';
import { useWebjsStatus } from '@/hooks/useWebjsStatus';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { isOrgOldEnough, NAV_GROUPS } from './nav-config';
import { useSubscription } from '@/hooks/useSubscription';

interface HeaderProps {
  onMenuClick?: () => void;
}

function connectionBadge(status: ReturnType<typeof useWebjsStatus>) {
  if (status === 'ready') return { tone: 'success' as const, label: 'Conectado' };
  if (status === 'connecting') return { tone: 'warning' as const, label: 'Conectando' };
  if (status === 'blocked') return { tone: 'error' as const, label: 'Bloqueado' };
  return { tone: 'neutral' as const, label: 'Desconectado' };
}

export function Header({ onMenuClick }: HeaderProps) {
  const webjsStatus = useWebjsStatus();
  const badge = connectionBadge(webjsStatus);
  const { role, isSuperAdmin, orgCreatedAt } = useAppUser();
  const { subscription } = useSubscription();
  const isBotPlan = subscription?.plan === 'bot';

  const allItems = NAV_GROUPS.flatMap((g) =>
    g.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (item.adminOnly && role !== 'admin') return false;
      if (item.requiresJarvis && isBotPlan) return false;
      if (item.requiresOrgAgeHours && !isOrgOldEnough(orgCreatedAt, item.requiresOrgAgeHours)) return false;
      return true;
    }),
  );

  return (
    <header className="v3-header h-14 shrink-0 flex items-center justify-between px-4 sm:px-6 gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg text-[var(--v3-text-secondary)] hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
          {allItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('v3-tab', isActive && 'v3-tab-active')
                }
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
          <StatusPulse tone={badge.tone} label={badge.label} />
        </div>
        {isSuperAdmin && <OrgSwitcher />}
        <NotificationsDropdown />
        <UserMenu />
      </div>
    </header>
  );
}
