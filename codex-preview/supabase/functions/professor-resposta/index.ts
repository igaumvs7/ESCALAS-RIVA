// ============================================================================
// professor-resposta
// ----------------------------------------------------------------------------
// Reescreve a mensagem que o usuário (qualquer ramo, não só imóveis) quer
// mandar pro cliente no WhatsApp, usando técnica de venda/persuasão real —
// ver BANCOS VIVAS CONNECT/IDEIAS-SOLTAS/PROFESSOR-RESPOSTA-ESTUDO-DE-VENDAS.md pra
// origem completa das regras abaixo. Limite de 20 usos/dia por organização
// (whatsapp_hub.professor_resposta_usage), pedido do dono 2026-09-09.
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { loadAppCredentials } from '../_shared/tenant-credentials.ts';
import { callLLM, parseJsonContent, type LLMProvider } from '../_shared/llm.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';

const DAILY_LIMIT = 20;

interface AskPayload {
  rascunho?: string;
  contexto?: string;
}

interface ExemploTroca {
  nao_diga: string;
  diga: string;
  motivo: string;
}

interface ProfessorResposta {
  mensagem: string;
  porque: string[];
  exemplos: ExemploTroca[];
}

// O estudo completo está em
// BANCOS VIVAS CONNECT/IDEIAS-SOLTAS/PROFESSOR-RESPOSTA-ESTUDO-DE-VENDAS.md — autores
// (Cialdini, Chris Voss, Kahneman, Sugarman, Schwartz), gatilhos mentais
// avaliados um a um, neurociência separando real de exagero popular,
// psicanálise, vendas em massa. Condensado aqui pro prompt.
const SYSTEM_PROMPT = `Você é o "Professor Resposta" do VIVAS CONNECT: um mentor de vendas que reescreve a mensagem que um vendedor (qualquer ramo, loja, serviço, curso, clínica, corretor de imóveis) quer mandar pro cliente no WhatsApp, deixando ela mais eficaz.

TOM (regra mais importante, nunca quebrar):
- Extremamente humanizado. Escreva EXATAMENTE como uma pessoa real digitaria no WhatsApp pra outra pessoa.
- PROIBIDO usar o caractere travessão (—) em qualquer lugar da resposta, nem na mensagem nem nas explicações. Use vírgula, ponto ou parênteses no lugar.
- PROIBIDO frases feitas de IA: "espero que ajude", "fico à disposição", "é importante notar que", "não hesite em".
- Calmo, educado, caloroso, nunca corretivo ou de cima pra baixo. Valide o esforço da pessoa antes de sugerir mudança.
- Frases curtas, linguagem concreta, nunca abstrata.

ESCOPO DA CORREÇÃO:
- Se o texto já está bom, faça só ajuste fino (poucas trocas pontuais).
- Se o texto está muito ruim (seco, implorando, confuso, zero contexto), reescreva a mensagem inteira.
- Priorize sempre taxa de resposta/venda sobre preservar o texto original.

BASE DE CONHECIMENTO A USAR (cite o nome do conceito nas explicações, não aplique escondido):
- Persuasão (Cialdini): reciprocidade, escassez REAL (nunca inventar urgência falsa), autoridade, prova social real, compromisso/coerência, afinidade.
- Psicologia da decisão (Kahneman): aversão à perda ("se esperar, perde a condição de hoje" pesa mais que "economize comprando agora"), ancoragem, especificidade (número concreto bate promessa vaga).
- Negociação e empatia tática (Chris Voss): rótulo emocional pra reengajar sem soar como cobrança ("Parece que ficou uma dúvida no ar..." em vez de "Você ainda não respondeu"), pergunta calibrada.
- Gatilhos mentais: use só os que têm base real (são, no fundo, os mesmos princípios de Cialdini com nome em português) — nunca invente gatilho sem sustentação.
- Vendas em massa: mensagem curta (2-4 frases), pedir sempre o MENOR próximo passo possível, nunca a decisão inteira de uma vez.
- Neurociência aplicada: decisão "racional" também depende de emoção (Damasio) — mensagem 100% fria e factual funciona pior que uma que também comunica como a escolha faz a pessoa se sentir. NUNCA use jargão de neuromarketing pop (tipo "isso libera oxitocina", "ativa gatilho X") como justificativa, é pseudociência.
- Psicanálise: só como pano de fundo cultural do campo, nunca como técnica ativa de reescrita, não force.

Responda SEMPRE em JSON estrito, sem markdown, sem texto fora do JSON, sem travessão em nenhum campo:
{
  "mensagem": "a mensagem reescrita, pronta pra copiar e colar, no idioma do rascunho original",
  "porque": ["cada bullet nomeia o conceito usado e explica em 1 frase curta por que funciona melhor pra ESSA mensagem específica, ex: Especificidade (em vez de promessa vaga, usei um número concreto)", "2 a 4 bullets no total"],
  "exemplos": [
    {"nao_diga": "trecho fraco relacionado ao tema da mensagem", "diga": "versão forte equivalente", "motivo": "explicação bem curta, 1 frase"},
    "exatamente 5 objetos desse formato, todos relacionados ao assunto/ramo da mensagem enviada, não genéricos de imóvel se o assunto for outro"
  ]
}`;

function buildUserPrompt(input: AskPayload): string {
  return [
    `O que a pessoa escreveu (rascunho ou ideia solta):`,
    `"""`,
    input.rascunho ?? '',
    `"""`,
    input.contexto?.trim() ? `\nContexto da conversa: ${input.contexto.trim()}` : '',
    `\nReescreva seguindo suas regras. Responda só o JSON pedido.`,
  ].join('\n');
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const caller = await requireOrgCaller(req);

    // GET só consulta o contador de hoje, sem gastar 1 uso — pro front
    // mostrar "7 de 20" antes de a pessoa clicar em perguntar.
    if (req.method === 'GET') {
      const { data: current, error } = await getAdminClient().rpc('get_professor_resposta_usage', {
        p_org_id: caller.orgId,
      });
      if (error) return jsonResponse({ ok: false, error: 'Erro ao checar uso.' }, { status: 500 });
      return jsonResponse({ ok: true, usosHoje: current ?? 0, limiteDiario: DAILY_LIMIT });
    }

    let body: AskPayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    if (!body.rascunho || body.rascunho.trim().length < 3) {
      return jsonResponse(
        { ok: false, error: 'Escreva o que você quer dizer pro cliente (mínimo alguns caracteres).' },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // Consome 1 uso do dia ANTES de chamar a IA — evita gastar a chamada se
    // o limite já bateu. RPC SECURITY DEFINER, só service_role chama (ver
    // migração 20260909220000_professor_resposta_usage.sql).
    const { data: usedCount, error: usageErr } = await admin.rpc(
      'consume_professor_resposta_usage',
      { p_org_id: caller.orgId },
    );
    if (usageErr) {
      console.error('professor-resposta usage error', usageErr);
      return jsonResponse({ ok: false, error: 'Erro ao checar limite diário.' }, { status: 500 });
    }
    if (usedCount === null) {
      return jsonResponse(
        {
          ok: false,
          error: 'limite_atingido',
          message: `Você já usou seus ${DAILY_LIMIT} conselhos de hoje. Volta amanhã que o Professor tá descansado!`,
        },
        { status: 429 },
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
          instrucao: 'Acesse Agente de IA > Configurações avançadas e configure a chave da IA.',
        },
        { status: 400 },
      );
    }

    // Mesmo teto de modelo/tokens que o resto do sistema já usa pra
    // ferramenta de uso pontual (ver round 56, 03-AUDITORIA-SEGURANCA.md) —
    // barato o suficiente pra não pesar no custo da plataforma.
    const llm = await callLLM({
      provider,
      apiKey,
      model: provider === 'openai' ? 'gpt-4o-mini' : undefined,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(body),
      json: true,
      temperature: 0.8,
      maxTokens: 1100,
    });

    let parsed: ProfessorResposta;
    try {
      parsed = parseJsonContent<ProfessorResposta>(llm.content);
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

    return jsonResponse({ ok: true, resultado: parsed, usosHoje: usedCount, limiteDiario: DAILY_LIMIT });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('professor-resposta error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
