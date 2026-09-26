import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

// Lê o singleton ai_agent_config e diz se a IA atende o canal. Com a IA
// desligada nas configurações, o inbox exibe "Humano" no lugar de "IA"
// (apresentação — o processamento já é bloqueado server-side). Instagram
// saiu de circulação (2026-08-24, pedido do dono): nunca teve mensagem de
// verdade chegando por lá desde a remoção do Zernio, que era quem roteava
// esse canal — só existe um canal hoje, WhatsApp.
export function useAiChannels(): { aiEnabledForChannel: (channel: string | null) => boolean } {
  const [config, setConfig] = useState<{ is_active: boolean; active_whatsapp: boolean } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    void supabase
      .from('ai_agent_config')
      .select('is_active, active_whatsapp')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({
            is_active: Boolean(data.is_active),
            active_whatsapp: Boolean(data.active_whatsapp ?? true),
          });
        }
      });
  }, []);

  // Mantém o parâmetro (ignorado) pra não obrigar mudança nos call sites —
  // só existe 1 canal hoje, então não há mais o que diferenciar por ele.
  const aiEnabledForChannel = useCallback(
    (_channel: string | null) => {
      if (!config) return true; // sem config carregada, mantém o comportamento atual
      return config.is_active && config.active_whatsapp;
    },
    [config],
  );

  return { aiEnabledForChannel };
}
