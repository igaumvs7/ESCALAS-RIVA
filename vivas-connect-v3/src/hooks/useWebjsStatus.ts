import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

export type WebjsHeaderStatus = 'ready' | 'connecting' | 'blocked' | 'disconnected' | 'none';

// Versão enxuta do que WebjsSettings.tsx já lê — só o status, pro indicador
// do cabeçalho. Poll mais espaçado (10s) porque aqui é só informativo, não
// precisa da mesma urgência da tela dedicada de conexão.
export function useWebjsStatus(): WebjsHeaderStatus {
  const { orgId } = useAppUser();
  const [status, setStatus] = useState<WebjsHeaderStatus>('none');

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const supabase = getSupabase();

    const refresh = async () => {
      const { data } = await supabase
        .schema('whatsapp_hub')
        .from('webjs_sessions')
        .select('status')
        .eq('org_id', orgId)
        .maybeSingle();
      if (cancelled) return;
      const raw = data?.status as string | undefined;
      if (!raw) setStatus('none');
      else if (raw === 'ready') setStatus('ready');
      else if (raw === 'blocked') setStatus('blocked');
      else if (raw === 'qr' || raw === 'authenticated' || raw === 'reconnecting') setStatus('connecting');
      else setStatus('disconnected');
    };

    void refresh();
    const interval = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orgId]);

  return status;
}
