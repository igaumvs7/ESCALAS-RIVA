import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, CreditCard, LogOut, Mail, Settings } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useAppUser } from '@/app/providers/AppUserProvider';

// ----------------------------------------------------------------------------
// UserMenu — substitui o antigo bloco "Conectado / e-mail cru + botão de sair"
// no canto superior direito (feedback: "mal feito, amador"). Segue o mesmo
// padrão de dropdown do OrgSwitcher (clique fora fecha). Mostra avatar (foto
// ou iniciais), nome de exibição (cai pro e-mail se não tiver) e a role —
// informação nova que não aparecia antes.
//
// Cabeçalho reescrito (2026-09-06, pedido do dono: "nesse formato está bem
// ruim... eu queria algo mais simples bonito e concreto"). Antes, sem nome
// de exibição configurado, o e-mail inteiro virava o "nome" em negrito,
// quebrado em 2 linhas — pesado e sem cara de conta de verdade. Agora: nome
// sempre amigável (nome de exibição, ou uma versão capitalizada da parte
// antes do @ do e-mail — "corretor.teste" → "Corretor Teste"), com um selo
// de função (badge, não mais texto solto) logo abaixo, e o e-mail completo
// vira uma linha pequena e discreta (1 linha só, trunca com "...", nunca
// mais quebra feio) — informação de apoio, não o destaque do cabeçalho.
// ----------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// "corretor.teste" -> "Corretor Teste" — usado só quando não há nome de
// exibição configurado, pra nunca precisar mostrar o e-mail cru como "nome".
function friendlyNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function UserMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { displayName, avatarUrl, role } = useAppUser();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const friendlyName = displayName?.trim() || (user?.email ? friendlyNameFromEmail(user.email) : null) || 'Minha conta';
  // No cabeçalho (sempre visível, espaço apertado), nunca mostra o e-mail
  // cru — ficava "desorganizado" (pedido do dono). E-mail completo continua
  // aparecendo dentro do menu aberto, numa linha pequena e discreta.
  const compactName = displayName?.trim() || 'Minha conta';
  const roleLabel = role ? ROLE_LABEL[role] : null;

  const handleLogout = async () => {
    await signOut();
    toast.success('Sessão encerrada.');
    navigate('/auth/login', { replace: true });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu do usuário"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-white/5"
      >
        <Avatar name={friendlyName} avatarUrl={avatarUrl} />
        <div className="hidden min-w-0 sm:block text-left leading-tight">
          <div className="max-w-[140px] truncate text-xs font-semibold text-[var(--color-text-primary)]">
            {compactName}
          </div>
          {roleLabel && (
            <div className="text-[0.65rem] uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
              {roleLabel}
            </div>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-2xl border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-[var(--color-bg-primary)] p-1.5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={friendlyName} avatarUrl={avatarUrl} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[var(--color-text-primary)]">
                {friendlyName}
              </div>
              {roleLabel && (
                <span className="mt-1 inline-flex items-center rounded-full bg-[rgba(var(--accent-secondary-rgb),0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-secondary)]">
                  {roleLabel}
                </span>
              )}
            </div>
          </div>
          {user?.email && (
            <div
              className="flex items-center gap-1.5 px-3 pb-2 text-xs text-[var(--color-text-secondary)]"
              title={user.email}
            >
              <Mail className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{user.email}</span>
            </div>
          )}
          <div className="my-1 h-px bg-[rgba(var(--accent-secondary-rgb),0.1)]" />
          {role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/planos');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-white/5"
            >
              <CreditCard className="h-4 w-4 text-[var(--color-text-secondary)]" />
              Planos
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings/profile');
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-white/5"
          >
            <Settings className="h-4 w-4 text-[var(--color-text-secondary)]" />
            Configurações
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--color-error)] transition hover:bg-[rgba(239,68,68,0.1)]"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatarUrl, size = 'sm' }: { name: string; avatarUrl: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  const dotOffset = size === 'sm' ? '-bottom-0.5 -right-0.5' : 'bottom-0 right-0';
  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className={`${dim} rounded-full object-cover ring-1 ring-[rgba(var(--accent-secondary-rgb),0.25)]`} />
      ) : (
        <div className={`${dim} flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] font-bold text-[var(--accent-primary-contrast)]`}>
          {initialsOf(name)}
        </div>
      )}
      {/* Você mesmo, óbvio que está online — indicador de presença simples. */}
      <span
        className={`absolute ${dotOffset} h-2 w-2 rounded-full ring-2 ring-[var(--color-bg-primary)]`}
        style={{ backgroundColor: 'var(--color-success)' }}
        aria-hidden="true"
      />
    </div>
  );
}
