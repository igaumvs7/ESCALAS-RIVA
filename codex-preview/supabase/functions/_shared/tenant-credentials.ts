// Reads app credentials from encrypted public.org_settings rows — one set per
// organization (multi-tenant build). Fonte de verdade: public.org_settings (KV
// cifrado), via getCredential.
//
// openai_api_key: custo de infraestrutura de IA sem motivo nenhum pra ser
// per-tenant — nao faz sentido pedir que cada cliente crie a propria conta
// OpenAI. Por isso ela cai pra uma chave DA PLATAFORMA
// (Deno.env.get('OPENAI_API_KEY'), configurada uma vez por Igor) sempre que
// a org nao tiver a propria (nenhuma vai ter, na pratica — o campo so existe
// pro caso raro de alguem querer trazer a propria chave no futuro).

import { getCredentials } from './credentials.ts';

export interface AppCredentials {
  llm_provider: 'openai' | 'claude' | 'gemini';
  llm_api_key: string | null;
  openai_api_key: string | null;
}

const VALID_PROVIDERS = new Set(['openai', 'claude', 'gemini']);

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Default openai: o openai_api_key esta sempre presente (embeddings/Whisper),
// entao 'openai' e o fallback seguro quando llm_provider nao foi gravado.
function readProvider(value: string | null): AppCredentials['llm_provider'] {
  const raw = value?.trim();
  if (raw && VALID_PROVIDERS.has(raw)) {
    return raw as AppCredentials['llm_provider'];
  }
  return 'openai';
}

export async function loadAppCredentials(orgId: string): Promise<AppCredentials> {
  const values = await getCredentials(orgId, ['llm_provider', 'llm_api_key', 'openai_api_key']);
  const openaiKey = nonEmpty(values.openai_api_key) ?? nonEmpty(Deno.env.get('OPENAI_API_KEY') ?? null);
  const provider = readProvider(values.llm_provider);
  const llmKeyEnv = nonEmpty(values.llm_api_key);
  // Allow a single openai_api_key to satisfy both embeddings and the LLM call
  // when the operator picked OpenAI as the chat provider.
  const llmKey = llmKeyEnv ?? (provider === 'openai' ? openaiKey : null);

  return {
    llm_provider: provider,
    llm_api_key: llmKey,
    openai_api_key: openaiKey,
  };
}
