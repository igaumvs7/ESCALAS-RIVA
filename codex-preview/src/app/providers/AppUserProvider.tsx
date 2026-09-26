import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

// PREVIEW MOCK — returns fake admin user data without touching Supabase.

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
  orgCreatedAt: string | null;
  profession: string | null;
  theme: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshProfession: () => Promise<void>;
  setAccountTheme: (theme: string) => Promise<void>;
}

const AppUserContext = createContext<AppUserContextValue | null>(null);

export function AppUserProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AppUserContextValue>(
    () => ({
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'admin',
      orgId: '00000000-0000-0000-0000-000000000010',
      isSuperAdmin: false,
      displayName: 'Admin Preview',
      avatarUrl: null,
      orgName: 'VIVAS Preview',
      orgStatus: 'active',
      orgCreatedAt: '2026-01-01T00:00:00Z',
      profession: 'Corretor de Imóveis',
      theme: null,
      loading: false,
      refreshProfile: async () => {},
      refreshProfession: async () => {},
      setAccountTheme: async () => {},
    }),
    [],
  );

  return (
    <AppUserContext.Provider value={value}>
      {children}
    </AppUserContext.Provider>
  );
}

export function useAppUser(): AppUserContextValue {
  const ctx = useContext(AppUserContext);
  if (!ctx) {
    throw new Error('useAppUser must be used inside <AppUserProvider>');
  }
  return ctx;
}
