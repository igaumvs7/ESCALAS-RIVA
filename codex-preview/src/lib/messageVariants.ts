// ----------------------------------------------------------------------------
// messageVariants — junta/separa até 5 textos alternativos num único corpo
// de template usando a sintaxe spintax `{a|b|c}` que o worker (webjs-worker/
// src/spintax.js::resolveSpintax) já resolve escolhendo UM aleatoriamente a
// cada envio. Pedido do dono (2026-08-27): "cinco textos diferentes...
// enviados de forma totalmente aleatória" pra não criar padrão de texto
// idêntico (gatilho de bloqueio). Nenhuma mudança no worker foi necessária —
// o motor de spintax já existia, só não tinha UI pra alimentar com "várias
// mensagens completas" em vez de frases soltas no meio do texto.
// ----------------------------------------------------------------------------

export const MAX_VARIANTS = 5;

export function joinVariants(variants: string[]): string {
  const clean = variants.map((v) => v.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return `{${clean.join('|')}}`;
}

// Só interpreta como "múltiplas variantes" quando o corpo INTEIRO é um único
// grupo spintax de ponta a ponta — evita confundir com `{{1}}` (variável) ou
// spintax parcial no meio de uma frase.
export function splitVariants(body: string): string[] {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1);
    if (!inner.includes('{') && !inner.includes('}')) {
      const parts = inner.split('|');
      if (parts.length > 1) return parts;
    }
  }
  return [trimmed];
}
