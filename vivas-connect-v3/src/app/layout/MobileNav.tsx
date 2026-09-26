import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOrgOldEnough, NAV_GROUPS } from './nav-config';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { useSubscription } from '@/hooks/useSubscription';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const { role, isSuperAdmin, orgCreatedAt } = useAppUser();
  const { subscription } = useSubscription();
  const isBotPlan = subscription?.plan === 'bot';
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (item.superAdminOnly) return isSuperAdmin;
      if (item.adminOnly && role !== 'admin') return false;
      if (item.requiresJarvis && isBotPlan) return false;
      if (item.requiresOrgAgeHours && !isOrgOldEnough(orgCreatedAt, item.requiresOrgAgeHours)) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 md:hidden transition-opacity duration-300',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-white flex flex-col transition-transform duration-300 shadow-2xl',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-label="Navegação"
      >
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-mark.png" alt="VIVAS" className="h-8 w-8 shrink-0 object-contain" />
            <img
              src="/logo-wordmark-dark.png"
              alt="VIVAS CONNECT"
              className="h-5 w-auto max-w-[140px] shrink object-contain"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-gray-400">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 min-h-11 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[var(--sidebar-v3-bg)] text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )
                    }
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
