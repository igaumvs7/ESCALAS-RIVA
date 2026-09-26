import { useCallback } from 'react';

export type WhatsappProvider = 'whatsapp' | 'instagram';

// Distingue o canal de cada conversa. WhatsApp roda 100% via webjs (Baileys)
// — sem janela de 24h, isso era exclusivo da API oficial da Meta (Zernio,
// removido). Instagram segue a API oficial da Meta e mantém a janela.
export function useWhatsappProvider(): {
  providerOf: (conv: { channel: string | null }) => WhatsappProvider;
} {
  const providerOf = useCallback(
    (conv: { channel: string | null }): WhatsappProvider => {
      return conv.channel === 'instagram' ? 'instagram' : 'whatsapp';
    },
    [],
  );
  return { providerOf };
}
