import { useEffect, useRef, useState } from 'react';
import { LifeBuoy, Loader2, MessageCircle, Send, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useHelpChat } from '@/hooks/useHelpChat';
import { useAppUser } from '@/app/providers/AppUserProvider';

const SUGGESTIONS = [
  'Como eu conecto meu WhatsApp?',
  'Como eu crio uma campanha?',
  'O que é a aba de Segurança do chip?',
  'Como eu importo meus contatos?',
];

// Suporte humano — pedido do dono (2026-09-06): "caso a pessoa esteja com
// duvida ou algum tipo de problema e a ia de suporte nao conseguiu resolver
// ter o meu whatzapp para entrar em contato tipo um suporte humano". Fixo,
// sempre visível (não depende da IA "detectar" que falhou — isso é frágil):
// é uma saída de emergência que funciona em qualquer cenário, IA tendo
// ajudado ou não.
const SUPPORT_WHATSAPP_E164 = '5585992620981';

function buildSupportWhatsAppUrl(orgName: string | null): string {
  const greeting = orgName
    ? `Oi Igor! Sou da conta "${orgName}" no Vivas Connect e preciso de ajuda com uma dúvida que o assistente não conseguiu resolver:`
    : 'Oi Igor! Preciso de ajuda com uma dúvida no Vivas Connect que o assistente não conseguiu resolver:';
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(greeting)}`;
}

export function HelpChatPanel() {
  const { messages, sending, error, send } = useHelpChat();
  const { orgName } = useAppUser();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const supportUrl = buildSupportWhatsAppUrl(orgName);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    void send(input);
    setInput('');
  };

  return (
    <Card>
      <div className="flex flex-col h-[560px]">
        <header className="flex items-start justify-between gap-3 pb-4 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[rgba(139,92,246,0.15)] flex items-center justify-center">
              <LifeBuoy className="h-4.5 w-4.5 text-[#A78BFA]" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Assistente de ajuda do sistema</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Tira dúvidas de como usar o Vivas Connect — não é o mesmo agente que fala com seus
                clientes (esse fica em Agente de IA).
              </p>
            </div>
          </div>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Não resolveu com o assistente? Fale direto comigo pelo WhatsApp"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(var(--color-success),0.35)] bg-[rgba(16,185,129,0.08)] px-3 py-1.5 text-xs font-semibold text-[var(--color-success)] hover:bg-[rgba(16,185,129,0.15)] transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Suporte humano
          </a>
        </header>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Oi! Sou o assistente do Vivas Connect. Pergunte como fazer alguma coisa no sistema —
                por exemplo:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-[rgba(var(--accent-secondary-rgb),0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.role === 'user' ? 'bg-white/10' : 'bg-[rgba(139,92,246,0.15)]'
                }`}
              >
                {m.role === 'user' ? (
                  <User className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
                ) : (
                  <LifeBuoy className="h-3.5 w-3.5 text-[#A78BFA]" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[rgba(var(--accent-secondary-rgb),0.12)] text-[var(--color-text-primary)]'
                    : 'bg-white/[0.03] border border-[rgba(var(--accent-secondary-rgb),0.1)] text-[var(--color-text-primary)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] pl-9">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pensando...
            </div>
          )}
          {error && (
            <div className="pl-9 space-y-1.5">
              <p className="text-xs text-[var(--color-error)]">{error}</p>
              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-success)] hover:underline"
              >
                <MessageCircle className="h-3 w-3" />
                Falar com o suporte humano no WhatsApp
              </a>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-[rgba(var(--accent-secondary-rgb),0.1)]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite sua dúvida..."
            disabled={sending}
            className="flex-1 h-11 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <Button type="button" onClick={handleSend} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
