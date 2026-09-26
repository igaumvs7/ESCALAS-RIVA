import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SendResult } from '@/hooks/useMessages';

interface MessageInputProps {
  conversationId: string;
  disabled?: boolean;
  // Envio OTIMISTA de texto: o balão aparece na hora e a requisição roda em
  // segundo plano (dono do estado é o useMessages).
  onSendText: (text: string, isPrivate: boolean) => Promise<SendResult>;
}

// Mídia, áudio e "reiniciar com template" saíram junto com o Zernio — o
// canal webjs (Baileys) ainda não suporta envio de mídia (fase 1: só texto)
// e não tem o conceito de janela de 24h/template aprovado da Meta.
//
// Nota privada removida daqui (2026-09-05, pedido do dono: "achei sem
// lógica, já temos a nota fixa funcionando super bem") — `onSendText`
// mantém o parâmetro `isPrivate` só porque useMessages.ts ainda suporta
// mensagens antigas desse tipo (histórico continua exibido no MessageThread),
// mas o composer sempre envia `false` agora.
export function MessageInput({ conversationId: _conversationId, disabled, onSendText }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const sendText = async () => {
    const text = content.trim();
    if (!text) return;
    setContent('');
    setSending(true);
    try {
      await onSendText(text, false);
      // Falha total: o próprio balão mostra "Não enviou · Reenviar" — sem toast.
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    void sendText();
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendText();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[rgba(var(--accent-secondary-rgb),0.08)] p-4 glass-surface"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKey}
          rows={2}
          disabled={disabled || sending}
          placeholder="Digite uma mensagem…"
          className="flex-1 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-none"
        />
        <Button type="submit" disabled={!content.trim() || sending || disabled} aria-label="Enviar" title="Enviar">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </div>
    </form>
  );
}
