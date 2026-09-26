import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

// PREVIEW MOCK — no Supabase calls.

export type WebjsSessionStatus =
  | 'disconnected'
  | 'qr'
  | 'authenticated'
  | 'ready'
  | 'reconnecting'
  | 'blocked';

export type WebjsBlockKind = 'confirmed' | 'risk' | null;

export interface WebjsSession {
  status: WebjsSessionStatus;
  qr_data_url: string | null;
  phone: string | null;
  last_error: string | null;
  blocked_until: string | null;
  block_count: number;
  recovery_until: string | null;
  recovery_daily_limit: number | null;
  block_kind: WebjsBlockKind;
}

interface WebjsSessionContextValue {
  session: WebjsSession | null | undefined;
  refresh: () => Promise<void>;
  setSession: (session: WebjsSession | null) => void;
}

const WebjsSessionContext = createContext<WebjsSessionContextValue | null>(null);

export function WebjsSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<WebjsSessionContextValue>(
    () => ({
      session: null,
      refresh: async () => {},
      setSession: () => {},
    }),
    [],
  );
  return <WebjsSessionContext.Provider value={value}>{children}</WebjsSessionContext.Provider>;
}

export function useWebjsSession(): WebjsSessionContextValue {
  const ctx = useContext(WebjsSessionContext);
  if (!ctx) {
    throw new Error('useWebjsSession must be used inside <WebjsSessionProvider>');
  }
  return ctx;
}
