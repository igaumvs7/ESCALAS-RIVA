// ============================================================================
// generate-template
// ----------------------------------------------------------------------------
// Takes a brief objective + idioma from the admin and asks the configured
// LLM (env-supplied) to draft a WhatsApp message. Retorna um JSON que a
// tela pré-preenche no formulário manual pro admin revisar antes de salvar.
// Sem categoria/header/botões — eram do fluxo de aprovação Meta/Zernio, sem
// efeito no envio via webjs (Baileys manda texto puro).
// ============================================================================

import { requireAdmin, AuthError } from '../_shared/auth.ts';
import { loadAppCredentials } from '../_shared/tenant-credentials.ts';
import { callLLM, parseJsonContent, type LLMProvider } from '../_shared/llm.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

interface GeneratePayload {
  name?: string;
  language?: string;
  objective?: string;
}

interface GeneratedTemplate {
  body: string;
}

const SYSTEM_PROMPT = `Você é um especialista em copywriting para mensagens de WhatsApp de corretores de imóveis. As mensagens são enviadas via VIVAS ENVIA (WhatsApp Web automatizado, não é API oficial da Meta) — não existe aprovação prévia nem categoria oficial, mas o texto entra no motor anti-bloqueio da plataforma, então:
 - Evite linguagem 100% idêntica pra todo mundo soar robótico: pode (e deve) usar as variáveis {{nome}} e {{empreendimento}} pra personalizar.
 - Sem linguagem promocional agressiva (evite "CLIQUE AGORA!", all-caps exagerado, excesso de emoji) — mensagens que parecem spam aumentam o risco do número ser bloqueado pelo WhatsApp.
 - Tom natural, como uma pessoa real escrevendo, não um anúncio.
 - Em português brasileiro (pt_BR) a menos que o usuário peça outro idioma.
 - Responda SEMPRE em JSON estrito no schema fornecido — sem markdown, sem prosa adicional.`;

function buildUserPrompt(input: GeneratePayload): string {
  return [
    `Gere uma mensagem de WhatsApp com as características a seguir.`,
    `Idioma: ${input.language ?? 'pt_BR'}`,
    ``,
    `Objetivo da mensagem:`,
    `"""`,
    input.objective ?? 'Mensagem genérica de atendimento.',
    `"""`,
    ``,
    `Responda com este JSON (sem comentários, sem markdown):`,
    `{`,
    `  "body": "texto da mensagem, pode usar {{1}}, {{2}}... para variáveis"`,
    `}`,
  ].join('\n');
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const caller = await requireAdmin(req);

    let body: GeneratePayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    if (!body.objective || body.objective.trim().length < 10) {
      return jsonResponse(
        { ok: false, error: 'Descreva o objetivo do template (mínimo 10 caracteres).' },
        { status: 400 },
      );
    }

    const creds = await loadAppCredentials(caller.orgId);
    const provider: LLMProvider | null = creds.llm_provider;
    const apiKey = creds.llm_api_key;

    if (!provider || !apiKey) {
      return jsonResponse(
        {
          ok: false,
          error: 'Credenciais de LLM nao configuradas.',
          instrucao:
            'Acesse Agente de IA > Configurações avançadas e configure a chave da IA.',
        },
        { status: 400 },
      );
    }

    const llm = await callLLM({
      provider,
      apiKey,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(body),
      json: true,
      temperature: 0.8,
      maxTokens: 1200,
    });

    let parsed: GeneratedTemplate;
    try {
      parsed = parseJsonContent<GeneratedTemplate>(llm.content);
    } catch (err) {
      return jsonResponse(
        {
          ok: false,
          error: `Resposta do modelo não é JSON válido: ${err instanceof Error ? err.message : String(err)}`,
          raw: llm.content,
        },
        { status: 502 },
      );
    }

    return jsonResponse({ ok: true, template: parsed, model: llm.model });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('generate-template error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
