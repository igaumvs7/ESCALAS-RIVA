import { useState } from 'react';
import { getSupabase, getSupabaseCredentials } from '@/lib/supabase';

export interface HelpChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ----------------------------------------------------------------------------
// useHelpChat — fala com a Edge Function help-assistant (2026-08-27, pedido
// do dono: "um chat dentro dessa aba com um agente de ia... pra tirar as
// dúvidas do que está acontecendo no sistema").
//
// Consome a resposta em streaming (2026-08-28, pedido do dono: chat estava
// demorando demais pra aparecer QUALQUER coisa) — por isso usa fetch() direto
// em vez de supabase.functions.invoke(), que só devolve a resposta inteira
// pronta, sem suportar leitura incremental do corpo.
// ----------------------------------------------------------------------------
export function useHelpChat() {
  const [messages, setMessages] = useState<HelpChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setError(null);
    const history = messages;
    setMessages((cur) => [...cur, { role: 'user', content: trimmed }]);
    setSending(true);

    let started = false;
    let full = '';

    try {
      const creds = getSupabaseCredentials();
      if (!creds) throw new Error('Supabase não configurado.');
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão expirada — faça login novamente.');

      const res = await fetch(`${creds.url.replace(/\/$/, '')}/functions/v1/help-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: creds.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, history }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => null);
        throw new Error((errBody?.error as string) ?? `Erro ${res.status} ao responder.`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { delta?: string; error?: string; done?: boolean };
          if (evt.error) throw new Error(evt.error);
          if (typeof evt.delta === 'string' && evt.delta) {
            full += evt.delta;
            if (!started) {
              started = true;
              setMessages((cur) => [...cur, { role: 'assistant', content: full }]);
            } else {
              setMessages((cur) => {
                const next = [...cur];
                next[next.length - 1] = { role: 'assistant', content: full };
                return next;
              });
            }
          }
        }
      }

      if (!started) throw new Error('O assistente não respondeu. Tente novamente.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível responder agora.';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return { messages, sending, error, send };
}
