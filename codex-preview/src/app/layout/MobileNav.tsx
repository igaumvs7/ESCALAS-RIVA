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

// Drawer de navegação para telas < md (768px). Sem ele, a Sidebar
// (`hidden md:flex`) deixava o app sem NENHUMA navegação no mobile.
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
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      />
      <aside
        className={cn(
          'mobile-command-drawer absolute left-0 top-0 h-full w-72 max-w-[84vw] flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-label="Navegação"
      >
        <div className="mobile-drawer-brand h-20 shrink-0 flex items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-mark.png" alt="VIVAS" className="h-9 w-9 shrink-0 object-contain" />
            {/* Bug real reportado (2026-08-31, print no celular): sem um
                limite de largura, o PNG da wordmark mantinha o tamanho
                natural dele (flex item "replaced" não encolhe sozinho —
                min-width:auto por padrão) e vazava por cima do botão de
                fechar num drawer estreito (w-72, 80vw no celular). */}
            <img
              src="/logo-wordmark-dark.png"
              alt="VIVAS CONNECT"
              className="h-6 w-auto max-w-[140px] shrink object-contain"
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="app-header-icon h-11 w-11 shrink-0 flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="sidebar-group-label px-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
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
                        'sidebar-navitem flex items-center gap-3 px-2.5 min-h-11 text-sm font-semibold transition-all duration-300',
                        isActive
                          ? 'sidebar-navitem-active text-[var(--color-text-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                      )
                    }
                  >
                    <span className="sidebar-icon-frame"><Icon className="h-4.5 w-4.5 shrink-0" /></span>
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
