import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from './AppUserProvider';

// ----------------------------------------------------------------------------
// WebjsSessionProvider
// ----------------------------------------------------------------------------
// BUG REAL corrigido (2026-09-14): `useWebjsSession` era um hook comum, sem
// estado compartilhado — cada componente que chamava (ConnectionStatusBar,
// WebjsSettings, VivasEnviaPage) tinha sua PRÓPRIA cópia de `session`. Dono
// reportou: clicou em Desconectar (na faixa ConnectionStatusBar), confirmou,
// viu "Desconectado" no toast, mas a tela continuou mostrando conectado — só
// sumia depois de dar F5. Causa: `handleDeactivate` chamava `setSession(null)`
// só na instância local do ConnectionStatusBar; a instância separada do hook
// dentro de VivasEnviaPage (que decide se mostra o painel de disparo ou a
// tela de QR) nunca ficava sabendo, e como o status dela ainda era 'ready',
// o polling de 3s estava DESLIGADO de propósito (só reativa quando não está
// 'ready') — nada nunca ia atualizar aquela cópia sem um reload da página.
// Fix: um único estado compartilhado via Context — qualquer `setSession`
// chamado por qualquer componente atualiza todo mundo que consome o hook.
// ----------------------------------------------------------------------------

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
  const { orgId } = useAppUser();
  const [session, setSession] = useState<WebjsSession | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const supabase = getSupabase();
    const { data } = await supabase
      .schema('whatsapp_hub')
      .from('webjs_sessions')
      .select('status, qr_data_url, phone, last_error, blocked_until, block_count, recovery_until, recovery_daily_limit, block_kind')
      .eq('org_id', orgId)
      .maybeSingle();
    setSession((data as WebjsSession | null) ?? null);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enquanto não estiver "ready", fica de olho a cada 3s (QR muda, status
  // avança) — o worker escreve nessa linha em segundo plano.
  useEffect(() => {
    if (session?.status === 'ready') return;
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [session?.status, refresh]);

  const value = useMemo<WebjsSessionContextValue>(
    () => ({ session, refresh, setSession }),
    [session, refresh],
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
