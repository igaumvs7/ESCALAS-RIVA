import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { isOrgOldEnough, NAV_GROUPS } from './nav-config';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { useSubscription } from '@/hooks/useSubscription';
import { getPlan } from '@/lib/plans';

const SUBSCRIPTION_STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'error' }> = {
  active: { label: 'Plano ativo', tone: 'success' },
  pending_first_payment: { label: 'Aguardando pagamento', tone: 'warning' },
  grace_period: { label: 'Pagamento pendente', tone: 'warning' },
  blocked: { label: 'Bloqueado', tone: 'error' },
  canceled: { label: 'Cancelado', tone: 'error' },
};

export function Sidebar() {
  const navigate = useNavigate();
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

  const statusMeta = subscription
    ? SUBSCRIPTION_STATUS_META[subscription.status] ?? SUBSCRIPTION_STATUS_META.active
    : null;

  return (
    <aside
      className="hidden md:flex md:flex-col shrink-0 w-[60px] sidebar-v3 overflow-hidden"
      aria-label="Navegação principal"
    >
      <div className="h-14 flex items-center justify-center border-b border-white/10">
        <img
          src="/logo-mark.png"
          alt="VIVAS"
          className="h-8 w-8 object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]"
        />
      </div>

      <nav className="sidebar-nav-scroll flex-1 min-h-0 flex flex-col overflow-y-auto py-3 px-[10px] gap-1">
        {groups.map((group, gi) => (
          <div key={group.label} className="flex flex-col items-center gap-1">
            {gi > 0 && (
              <div className="w-6 h-px bg-white/15 my-1.5" />
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={({ isActive }) =>
                    cn(
                      'sidebar-v3-btn group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                      isActive
                        ? 'bg-white text-[var(--sidebar-v3-bg)] shadow-md'
                        : 'text-white/50 hover:bg-white/12 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="sidebar-v3-tooltip">
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 py-3 flex flex-col items-center">
        <button
          type="button"
          onClick={() => role === 'admin' && navigate('/planos')}
          title={
            statusMeta
              ? `${subscription?.plan ? getPlan(subscription.plan).name : ''} · ${statusMeta.label}`
              : 'Ver planos'
          }
          className="w-9 h-9 rounded-full border-2 border-white/30 bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:border-white/60 transition-all"
        >
          <img src="/logo-mark.png" alt="" className="h-5 w-5 object-contain" />
        </button>
      </div>
    </aside>
  );
}
