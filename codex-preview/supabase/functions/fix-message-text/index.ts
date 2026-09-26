// ============================================================================
// fix-message-text
// ----------------------------------------------------------------------------
// Botão "Corrigir com IA" em cada variação de mensagem do Disparador/
// Templates (pedido do dono, 2026-08-27): corrige ortografia/gramática e
// organiza a ideia do rascunho que o usuário já escreveu — não é geração do
// zero (isso já existe em generate-template), é revisão de texto existente.
// Preserva {{1}}, {{2}}... intactos (o LLM é instruído a nunca mexer neles).
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { loadAppCredentials } from '../_shared/tenant-credentials.ts';
import { callLLM } from '../_shared/llm.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

interface FixPayload {
  text?: string;
}

const MAX_TEXT_LEN = 2000;

const SYSTEM_PROMPT = `Você corrige textos de mensagens de WhatsApp em português do Brasil, escritos por corretores de imóveis pra mandar pros próprios clientes.

Sua tarefa:
- Corrija ortografia, acentuação e gramática.
- Deixe a frase mais clara e organizada, mantendo o MESMO sentido e tom que a pessoa já escreveu — não deixe robótico nem formal demais, é uma mensagem de WhatsApp.
- NUNCA remova, altere ou mova marcadores no formato {{1}}, {{2}}, {{3}} etc — copie exatamente como estão, na mesma posição relativa que fazem sentido na frase corrigida.
- NUNCA adicione informação nova, nem mude o que a mensagem está oferecendo ou pedindo.
- Responda APENAS com o texto corrigido — sem aspas, sem explicação, sem markdown.`;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const caller = await requireOrgCaller(req);

    let body: FixPayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const text = (body.text ?? '').trim();
    if (!text) {
      return jsonResponse({ ok: false, error: 'Escreva algum texto antes de corrigir.' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LEN) {
      return jsonResponse({ ok: false, error: 'Texto muito longo pra corrigir de uma vez.' }, { status: 400 });
    }

    const creds = await loadAppCredentials(caller.orgId);
    if (!creds.llm_provider || !creds.llm_api_key) {
      return jsonResponse(
        { ok: false, error: 'A correção por IA está temporariamente indisponível.' },
        { status: 503 },
      );
    }

    const llm = await callLLM({
      provider: creds.llm_provider,
      apiKey: creds.llm_api_key,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Corrija este texto:\n"""\n${text}\n"""`,
      temperature: 0.3,
      maxTokens: 500,
    });

    return jsonResponse({ ok: true, text: llm.content.trim(), model: llm.model });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('fix-message-text error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
