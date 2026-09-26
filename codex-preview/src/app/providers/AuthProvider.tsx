import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

// PREVIEW MOCK — returns a fake admin session without touching Supabase.

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ) => Promise<{ error: string | null; sessionCreated: boolean; emailAlreadyExists: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FAKE_USER: User = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@preview.local',
  app_metadata: {
    role: 'admin',
    org_id: '00000000-0000-0000-0000-000000000010',
    home_org_id: '00000000-0000-0000-0000-000000000010',
    is_super_admin: false,
  },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
} as unknown as User;

const FAKE_SESSION: Session = {
  access_token: 'mock-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh',
  user: FAKE_USER,
} as unknown as Session;

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      session: FAKE_SESSION,
      user: FAKE_USER,
      loading: false,
      signUp: async () => ({ error: null, sessionCreated: true, emailAlreadyExists: false }),
      signIn: async () => ({ error: null }),
      signOut: async () => {},
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
