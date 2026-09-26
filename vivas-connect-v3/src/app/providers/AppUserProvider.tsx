import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

// ----------------------------------------------------------------------------
// AppUserProvider
// ----------------------------------------------------------------------------
// Multi-tenant build: cada usuário pertence a uma organização. O acesso e a
// role vêm do JWT app_metadata (populado pelos triggers de auth). O perfil
// exibível (display_name / avatar_url) vem da linha do próprio user em
// whatsapp_hub.app_users, e os dados da org de whatsapp_hub.organizations.
//
// Role gating deve consumir `useAppUser().role`; o JWT é a fonte de verdade
// para controle de acesso. Se a org estiver arquivada, o app inteiro é
// bloqueado por uma tela cheia (sem sidebar).
// ----------------------------------------------------------------------------

export type AppRole = 'admin' | 'operator';
export type OrgStatus = 'active' | 'archived';

interface AppUserContextValue {
  userId: string | null;
  role: AppRole | null;
  orgId: string | null;
  isSuperAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  orgName: string | null;
  orgStatus: OrgStatus | null;
  // Data de criação da org — usado pra liberar a aba de Feedback só depois
  // de algumas horas de conta (ver FEEDBACK_UNLOCK_HOURS em nav-config.ts).
  orgCreatedAt: string | null;
  profession: string | null;
  theme: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshProfession: () => Promise<void>;
  setAccountTheme: (theme: string) => Promise<void>;
}

const AppUserContext = createContext<AppUserContextValue | null>(null);

function readRoleFromUser(appMetadata: Record<string, unknown> | undefined): AppRole | null {
  if (!appMetadata) return null;
  const role = appMetadata['role'];
  if (role === 'admin' || role === 'operator') {
    return role;
  }
  return null;
}

function readStringClaim(
  appMetadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = appMetadata?.[key];
  return typeof value === 'string' && value ? value : null;
}

export function AppUserProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  const appMetadata = user?.app_metadata as Record<string, unknown> | undefined;

  const role = useMemo(() => readRoleFromUser(appMetadata), [appMetadata]);
  const orgId = useMemo(() => readStringClaim(appMetadata, 'org_id'), [appMetadata]);
  const isSuperAdmin = useMemo(() => appMetadata?.['is_super_admin'] === true, [appMetadata]);

  // Perfil (display_name / avatar_url) e dados da org são carregados do banco.
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgStatus, setOrgStatus] = useState<OrgStatus | null>(null);
  const [orgCreatedAt, setOrgCreatedAt] = useState<string | null>(null);
  const [profession, setProfession] = useState<string | null>(null);
  const [theme, setThemeValue] = useState<string | null>(null);

  const userId = user?.id ?? null;

  // Carrega a linha do próprio user em app_users (perfil exibível + tema).
  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setDisplayName(null);
      setAvatarUrl(null);
      setThemeValue(null);
      return;
    }
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('app_users')
      .select('display_name, avatar_url, theme')
      .eq('user_id', userId)
      .maybeSingle();
    setDisplayName((data?.display_name as string | null) ?? null);
    setAvatarUrl((data?.avatar_url as string | null) ?? null);
    setThemeValue((data?.theme as string | null) ?? null);
  }, [userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  // Tema é preferência DA CONTA, não do navegador (pedido do dono: precisa
  // acompanhar login em qualquer computador/aba anônima). ThemeProvider
  // consome `theme` pra aplicar e chama isso quando o usuário confirma a
  // troca (botão Salvar).
  //
  // BUG REAL corrigido (2026-08-27): antes esta função ATUALIZAVA o estado
  // local ANTES de escrever no banco e NUNCA checava o `error` da escrita —
  // se a escrita falhasse (rede, sessão expirada, etc.), a tela continuava
  // mostrando o tema novo como se tivesse salvo, mas o banco ficava com o
  // valor antigo. Resultado relatado pelo dono: "às vezes buga, não salva,
  // quando eu saio vem outro" — em outro computador/aba, o tema voltava pro
  // antigo porque nunca tinha sido salvo de verdade. Agora: só atualiza o
  // estado local DEPOIS de confirmar que a escrita deu certo, e propaga o
  // erro pra quem chamou poder avisar o usuário (toast de verdade, não
  // sucesso fingido).
  const setAccountTheme = useCallback(
    async (newTheme: string) => {
      if (!userId) {
        setThemeValue(newTheme);
        return;
      }
      const supabase = getSupabase();
      const { error } = await supabase
        .schema('whatsapp_hub')
        .from('app_users')
        .update({ theme: newTheme })
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      setThemeValue(newTheme);
    },
    [userId],
  );

  // Dados da própria org (nome + status). Membro pode SELECT a própria org
  // mesmo arquivada; usamos isso para a tela de bloqueio.
  useEffect(() => {
    if (!userId || !orgId) {
      setOrgName(null);
      setOrgStatus(null);
      setOrgCreatedAt(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .schema('whatsapp_hub')
        .from('organizations')
        .select('name, status, created_at')
        .eq('id', orgId)
        .maybeSingle();
      if (cancelled) return;
      setOrgName((data?.name as string | null) ?? null);
      setOrgStatus((data?.status as OrgStatus | null) ?? null);
      setOrgCreatedAt((data?.created_at as string | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, orgId]);

  // Profissão escolhida no cadastro (whatsapp_hub.agent_sites.segmento) —
  // orgs de bootstrap/convite não têm agent_sites, por isso maybeSingle.
  // Exposta como função (não só efeito) pra quem edita a profissão em
  // Configurações > Vivas Perfil poder atualizar o rodapé da sidebar na
  // hora, sem esperar um reload da página.
  const refreshProfession = useCallback(async () => {
    if (!orgId) {
      setProfession(null);
      return;
    }
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('agent_sites')
      .select('segmento')
      .eq('org_id', orgId)
      .maybeSingle();
    setProfession((data?.segmento as string | null) ?? null);
  }, [orgId]);

  useEffect(() => {
    void refreshProfession();
  }, [refreshProfession]);

  const value = useMemo<AppUserContextValue>(
    () => ({
      userId,
      role,
      orgId,
      isSuperAdmin,
      displayName,
      avatarUrl,
      orgName,
      orgStatus,
      orgCreatedAt,
      profession,
      theme,
      loading,
      refreshProfile,
      refreshProfession,
      setAccountTheme,
    }),
    [
      userId,
      role,
      orgId,
      isSuperAdmin,
      displayName,
      avatarUrl,
      orgName,
      orgStatus,
      orgCreatedAt,
      profession,
      theme,
      loading,
      refreshProfile,
      refreshProfession,
      setAccountTheme,
    ],
  );

  return (
    <AppUserContext.Provider value={value}>
      {/* Org desativada bloqueia os membros — mas NUNCA o super admin, que
          precisa do console /admin para reativá-la (evita lockout). */}
      {orgStatus === 'archived' && !isSuperAdmin ? <ArchivedOrgScreen /> : children}
    </AppUserContext.Provider>
  );
}

// Tela cheia de bloqueio quando a org está desativada — sem sidebar, no padrão
// glass do design system.
function ArchivedOrgScreen() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(245,158,11,0.12)]">
          <AlertTriangle className="h-6 w-6 text-[#FBBF24]" />
        </div>
        <h1 className="text-xl font-bold text-display text-[var(--color-text-primary)]">
          Organização desativada
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          O acesso a esta organização foi temporariamente suspenso. Entre em
          contato com o administrador do CRM para reativá-la.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex items-center justify-center rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition hover:border-[var(--accent-primary)] hover:bg-white/5"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

export function useAppUser(): AppUserContextValue {
  const ctx = useContext(AppUserContext);
  if (!ctx) {
    throw new Error('useAppUser must be used inside <AppUserProvider>');
  }
  return ctx;
}
