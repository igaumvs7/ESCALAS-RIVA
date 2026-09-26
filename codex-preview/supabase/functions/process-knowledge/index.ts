// ============================================================================
// process-knowledge
// ----------------------------------------------------------------------------
// Takes a knowledge_base row and turns it into searchable RAG chunks:
//
//   1. Loads the target KB row.
//   2. Fetches plaintext from the source (raw text passed in, or URL fetch
//      with a rough HTML-strip).
//   3. Chunks the text into ~500-token windows with 50-token overlap. We
//      approximate tokens as chars / 4 — cheap heuristic that's accurate
//      enough for embeddings, and keeps the chunker dependency-free.
//   4. Calls OpenAI embeddings in batches of 100 inputs with openai_api_key
//      from encrypted app settings to produce 1536-dim vectors.
//   5. Inserts the chunks + vectors into knowledge_chunks and marks the KB
//      status='ready' (or 'error' on failure).
// ============================================================================

import { requireAdmin, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { loadAppCredentials } from '../_shared/tenant-credentials.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
// npm: specifier em vez de esm.sh — o build serverless do unpdf (pdfjs-serverless)
// é mais confiável no runtime Deno do Supabase Edge para extrair texto de PDF.
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';
// pdf-lib roda em JS puro (sem canvas nativo), então funciona no runtime Deno
// do Supabase Edge — usada só pra FATIAR o PDF em lotes de poucas páginas.
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

type SourceType = 'text' | 'url' | 'pdf';

interface Payload {
  knowledge_base_id?: string;
  source_type?: SourceType;
  // For text: raw text. For url: the URL. For pdf: the storage file_path
  // under bucket whatsapp-hub-knowledge.
  content?: string;
}

const KNOWLEDGE_BUCKET = 'whatsapp-hub-knowledge';

const CHUNK_CHARS = 2000;   // ~500 tokens
const OVERLAP_CHARS = 200;  // ~50 tokens
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;
const EMBED_BATCH = 100;
// Modelo de visão pra ler PDF escaneado. Escolhido por MEDIÇÃO, não por
// intuição — benchmark com o book real de um cliente (41 páginas, páginas
// 18-21 que têm dados de lazer), mesmo prompt, mesmas páginas:
//
//   modelo         tokens    leu?         custo/book de 40p
//   gpt-4o-mini    102.214   NÃO          R$ 0,83
//   gpt-4o           3.270   NÃO          R$ 0,44
//   gpt-4.1-mini     5.194   SIM          R$ 0,11   <-- escolhido
//   gpt-4.1-nano     7.774   NÃO          R$ 0,04
//
// O gpt-4o-mini (usado antes) era o pior dos dois mundos: consumia 20x mais
// tokens que o 4.1-mini E mesmo assim respondia SEM_DADOS nas mesmas páginas
// que o 4.1-mini leu certinho. Era ele a causa real do "a IA não sabe
// responder sobre o material". O nano é mais barato mas também não lê —
// barato que não lê não serve.
const VISION_MODEL = 'gpt-4.1-mini';
// Piso de caracteres por lote pra considerar que veio conteúdo. Baixo de
// propósito: página de lazer legítima rendeu só 158 caracteres (são ícones
// com legenda curta). O sinal forte de "não tem nada aqui" é o SEM_DADOS
// explícito do prompt, não o tamanho.
const MIN_PDF_TEXT_CHARS = 25;
// Teto de segurança POR LOTE (defesa em profundidade contra página com imagem
// anômala). Com 8 páginas/lote o normal medido é ~10k tokens, então 100k só
// dispara se algo estiver muito errado.
const MAX_SAFE_INPUT_TOKENS = 100_000;
// Páginas por chamada. Medido: 4 páginas = 5.194 tokens no 4.1-mini, ou seja
// ~1,3k por página. 8 páginas ≈ 10k tokens — folgadíssimo, e corta o número
// de chamadas (41 páginas viram 6 lotes em vez de 21).
const PAGES_PER_VISION_BATCH = 8;
// Lotes processados ao mesmo tempo. Segura o tempo total (a Edge Function tem
// limite de execução) sem estourar rate limit da OpenAI.
const VISION_CONCURRENCY = 4;
// Teto duro de páginas escaneadas por material — limite de TEMPO, não de
// custo (100 páginas ≈ 13 lotes ≈ 4 rodadas ≈ R$0,28).
const MAX_SCANNED_PAGES = 100;
// Cota de página escaneada POR ORGANIZAÇÃO. Decisão do dono (2026-09-07):
// limitar só o que custa. Texto colado, .txt, URL e PDF com texto selecionável
// não passam por IA de visão, custam ~zero e por isso são ILIMITADOS — não faz
// sentido travar o cliente por algo que não gera despesa ("o que não tiver
// custo a gente não precisa limitar"). 600 páginas ≈ R$1,70 ≈ 15 books de 40
// páginas, folgado pra carteira de qualquer corretor.
const ORG_SCANNED_PAGES_QUOTA = 600;

function stripHtml(html: string): string {
  // Remove <script>/<style> blocks entirely, drop remaining tags, collapse
  // whitespace. Good enough for marketing copy / FAQ pages; NOT a parser.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Lê UM LOTE de páginas (PDF escaneado) via OpenAI Responses API (input_file).
// Reusa a openai_api_key (já obrigatória p/ embeddings).
//
// Recebe um lote, não o arquivo inteiro, por causa da causa raiz achada em
// produção (2026-09-07, log "openai_pdf_extract_raw"): mandar o book completo
// gerou 1.046.050 input_tokens numa chamada — 8x+ o contexto do gpt-4o-mini
// (~128k). O modelo não erra (responde 200), só desiste com uma frase curta
// de desculpa. Devolvemos usage.input_tokens junto porque é um sinal de
// estouro mais confiável que o tamanho do texto (uma recusa educada pode ter
// 150+ caracteres e ainda assim não ser conteúdo).
async function extractPdfViaOpenAI(
  openaiKey: string,
  bytes: Uint8Array,
): Promise<{ text: string; inputTokens: number }> {
  const dataUrl = `data:application/pdf;base64,${bytesToBase64(bytes)}`;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: 'document.pdf', file_data: dataUrl },
            {
              // O pedido anterior ("transcreva integralmente") provocava
              // recusa do próprio modelo ("não posso transcrever o documento
              // integralmente") — lido como pedido de reprodução de obra.
              // Reformulado como leitura de material comercial do próprio
              // usuário, focado em dados factuais, que é o que a base de
              // conhecimento precisa e o modelo entrega sem resistência.
              type: 'input_text',
              text: [
                'Este é um material comercial (catálogo/folder de produto ou empreendimento) enviado pelo próprio dono do negócio para alimentar o atendimento dele.',
                'Liste em texto corrido, em português do Brasil, TODAS as informações factuais visíveis nestas páginas: nomes, endereços, metragens, plantas, número de quartos/suítes/vagas, andares, blocos, elevadores, itens de lazer, diferenciais, condições comerciais, telefones e qualquer dado numérico.',
                'Não resuma e não comente: só liste os dados como aparecem.',
                'Se estas páginas não tiverem nenhum dado legível (só imagem decorativa), responda exatamente: SEM_DADOS.',
              ].join(' '),
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI responses ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const inputTokens: number = Number(body.usage?.input_tokens ?? 0);
  console.log(JSON.stringify({
    event: 'openai_pdf_extract_raw',
    status: res.status,
    input_tokens: inputTokens,
    output_text: typeof body.output_text === 'string' ? body.output_text.slice(0, 300) : null,
  }));
  const text: string =
    (typeof body.output_text === 'string' && body.output_text) ||
    ((body.output ?? []) as Array<{ content?: Array<{ text?: string }> }>)
      .flatMap((o) => (o.content ?? []).map((c) => c.text))
      .filter((t): t is string => Boolean(t))
      .join('\n');
  if (!text || !text.trim()) throw new Error('OpenAI não extraiu texto do PDF');
  return { text: text.trim(), inputTokens };
}

// Hash do conteúdo do arquivo, pra reconhecer o MESMO material subido de novo
// e não pagar a leitura por IA duas vezes.
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fatia o PDF em PDFs menores de `pagesPerBatch` páginas cada. Só reempacota
// as páginas (não re-renderiza imagem), então é barato de CPU e mantém a
// qualidade original que a visão da OpenAI precisa pra ler o texto.
async function splitPdfIntoBatches(
  bytes: Uint8Array,
  pagesPerBatch: number,
): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const batches: Uint8Array[] = [];
  for (let start = 0; start < total; start += pagesPerBatch) {
    const out = await PDFDocument.create();
    const indices: number[] = [];
    for (let i = start; i < Math.min(start + pagesPerBatch, total); i += 1) indices.push(i);
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    batches.push(await out.save());
  }
  return batches;
}

// Executa `fn` sobre os itens com no máximo `limit` em voo ao mesmo tempo,
// preservando a ORDEM do resultado (importante: as páginas do material
// precisam ser concatenadas na ordem certa).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(clean.length, cursor + CHUNK_CHARS);
    chunks.push(clean.slice(cursor, end).trim());
    if (end === clean.length) break;
    cursor = end - OVERLAP_CHARS;
  }
  return chunks.filter((c) => c.length > 0);
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${err}`);
  }
  const body = await res.json();
  const rows = (body?.data ?? []) as Array<{ embedding: number[]; index: number }>;
  rows.sort((a, b) => a.index - b.index);
  return rows.map((r) => r.embedding);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const caller = await requireAdmin(req);

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    if (!body.knowledge_base_id || !body.source_type || !body.content) {
      return jsonResponse(
        { ok: false, error: 'knowledge_base_id, source_type e content são obrigatórios.' },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const { data: kbRow, error: kbErr } = await admin
      .from('knowledge_base')
      .select('id, org_id')
      .eq('id', body.knowledge_base_id)
      .maybeSingle();
    if (kbErr) return jsonResponse({ ok: false, error: kbErr.message }, { status: 500 });
    if (!kbRow) {
      return jsonResponse({ ok: false, error: 'Knowledge base não encontrada.' }, { status: 404 });
    }
    // Cross-check de org: a KB deve pertencer à org do caller.
    if ((kbRow as { org_id: string }).org_id !== caller.orgId) {
      return jsonResponse({ ok: false, error: 'Knowledge base não encontrada.' }, { status: 404 });
    }

    const fail = async (msg: string, status = 500) => {
      // Loga o motivo real da falha (o front só vê status='error' na linha).
      console.error(JSON.stringify({
        event: 'process_knowledge_fail',
        knowledge_base_id: body.knowledge_base_id,
        source_type: body.source_type,
        status,
        message: msg,
      }));
      await admin
        .from('knowledge_base')
        .update({ status: 'error', error_message: msg })
        .eq('id', body.knowledge_base_id);
      return jsonResponse({ ok: false, error: msg }, { status });
    };

    const creds = await loadAppCredentials(caller.orgId);
    if (!creds.openai_api_key) {
      return fail('Credencial openai_api_key nao configurada. Acesse /settings/credentials.', 400);
    }

    // Cota de páginas escaneadas da org. Retorna a mensagem de erro quando não
    // cabe, ou null quando pode seguir. Usada nos DOIS caminhos que ocupam
    // cota (leitura nova por IA e reuso do cache), pra que a regra não possa
    // divergir entre eles — foi assim que quase escapou um furo: reuso de
    // cache sem checagem deixaria apagar-e-resubir estourar o limite.
    const quotaBlockMessage = async (incomingPages: number): Promise<string | null> => {
      if (incomingPages <= 0) return null;
      const { data: usedRows } = await admin
        .from('knowledge_base')
        .select('scanned_pages')
        .eq('org_id', caller.orgId)
        .neq('id', body.knowledge_base_id);
      const usedPages = ((usedRows ?? []) as Array<{ scanned_pages: number | null }>)
        .reduce((sum, r) => sum + (r.scanned_pages ?? 0), 0);
      if (usedPages + incomingPages <= ORG_SCANNED_PAGES_QUOTA) return null;
      const left = Math.max(0, ORG_SCANNED_PAGES_QUOTA - usedPages);
      return (
        `Limite de páginas escaneadas atingido: seu plano permite ${ORG_SCANNED_PAGES_QUOTA} páginas de material escaneado (foto/scan) e você já usou ${usedPages}. Este arquivo tem ${incomingPages} páginas e só restam ${left}. ` +
        `Materiais em texto (colado, .txt, link ou PDF com texto selecionável) continuam ilimitados — ou apague um material escaneado antigo pra liberar espaço.`
      );
    };

    // 1. Resolve plaintext.
    let plaintext = '';
    // Preenchido só no caminho de PDF — usado pra reconhecer o mesmo arquivo
    // subido de novo e não pagar a leitura por IA outra vez.
    let contentHash: string | null = null;
    // Só fica > 0 quando o material precisou de IA de visão (PDF escaneado).
    // É o que conta na cota — o resto é ilimitado porque não custa.
    let scannedPages = 0;
    if (body.source_type === 'text') {
      plaintext = body.content.trim();
    } else if (body.source_type === 'url') {
      try {
        const urlRes = await fetch(body.content, {
          headers: { 'User-Agent': 'whatsapp-hub-knowledge/1.0' },
        });
        if (!urlRes.ok) {
          return fail(`Falha ao buscar URL: HTTP ${urlRes.status}`);
        }
        const html = await urlRes.text();
        plaintext = stripHtml(html);
      } catch (err) {
        return fail(`Falha ao buscar URL: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (body.source_type === 'pdf') {
      try {
        // body.content é o path do arquivo no bucket whatsapp-hub-knowledge.
        // Multi-tenant: os arquivos ficam sob o prefixo `<orgId>/`. Aceitamos
        // tanto o path já prefixado quanto o path relativo (prefixamos aqui).
        const storagePath = body.content.startsWith(`${caller.orgId}/`)
          ? body.content
          : `${caller.orgId}/${body.content}`;
        const { data: blob, error: dlErr } = await admin.storage
          .from(KNOWLEDGE_BUCKET)
          .download(storagePath);
        if (dlErr || !blob) {
          return fail(`Falha ao baixar PDF: ${dlErr?.message ?? 'desconhecido'}`);
        }
        const buffer = new Uint8Array(await blob.arrayBuffer());

        // Dedupe: se ESTE mesmo arquivo (byte a byte) já foi lido nesta org,
        // reaproveita o texto em vez de pagar a leitura por IA de novo.
        // Caso real: o dono subiu o mesmo book 6x numa madrugada depurando um
        // bug — 6 leituras cobradas pelo mesmo PDF.
        //
        // Lê do CACHE (tabela própria), não da linha de knowledge_base: o
        // cliente pode apagar o material pra liberar cota, e nesse caso a
        // linha some — mas o cache fica, então resubir o mesmo arquivo
        // continua custando zero.
        contentHash = await sha256Hex(buffer);
        const { data: cached } = await admin
          .from('knowledge_extraction_cache')
          .select('extracted_text, scanned_pages')
          .eq('org_id', caller.orgId)
          .eq('content_hash', contentHash)
          .maybeSingle();
        const cachedRow = cached as { extracted_text?: string; scanned_pages?: number } | null;
        const cachedText = cachedRow?.extracted_text ?? '';
        if (cachedText.length >= MIN_PDF_TEXT_CHARS) {
          console.log(JSON.stringify({
            event: 'knowledge_reused_from_cache',
            knowledge_base_id: body.knowledge_base_id,
            chars: cachedText.length,
          }));
          // Reocupa a mesma cota que o material ocupava antes: o arquivo
          // continua sendo N páginas escaneadas guardadas na base, mesmo sem
          // ter custado uma leitura nova. Sem isso, apagar e resubir zeraria
          // a cota e daria pra guardar material ilimitado.
          const reusedPages = cachedRow?.scanned_pages ?? 0;
          const blocked = await quotaBlockMessage(reusedPages);
          if (blocked) return fail(blocked, 422);
          plaintext = cachedText;
          scannedPages = reusedPages;
        }

        // 1ª tentativa: unpdf (rápido/grátis, PDF com camada de texto).
        // Só roda se o dedupe acima não resolveu.
        let numPages = 0;
        if (!plaintext) {
          try {
            const doc = await getDocumentProxy(buffer);
            numPages = doc.numPages ?? 0;
            const { text } = await extractText(doc, { mergePages: true });
            plaintext = (Array.isArray(text) ? text.join('\n') : text ?? '').trim();
          } catch (unpdfErr) {
            console.error(JSON.stringify({ event: 'unpdf_extract_error', error: String(unpdfErr) }));
            plaintext = '';
          }
        }
        // Fallback: PDF escaneado (sem texto) ou unpdf falhou → OpenAI lê o PDF.
        //
        // Causa raiz real (2026-09-07): mandar o PDF INTEIRO numa chamada só
        // gerou 1.046.050 input_tokens — 8x+ o contexto do gpt-4o-mini
        // (~128k). Acima disso o modelo não erra, só desiste com uma frase
        // curta de desculpa (que o sistema aceitava como conteúdo). A
        // correção não é recusar o arquivo — o corretor precisa poder jogar
        // o material e pronto — é FATIAR o PDF em lotes de poucas páginas e
        // juntar o texto de volta na ordem.
        if (plaintext.length < 20) {
          if (numPages > MAX_SCANNED_PAGES) {
            return fail(
              `Este material tem ${numPages} páginas escaneadas (sem texto selecionável) — acima do limite de ${MAX_SCANNED_PAGES} páginas por arquivo. Divida em partes menores e suba uma de cada vez.`,
              422,
            );
          }

          // Cota da org — checada ANTES de gastar. Só conta material que
          // precisou de IA de visão; texto/.txt/URL/PDF com texto nem chegam
          // aqui e por isso são ilimitados.
          const blocked = await quotaBlockMessage(numPages);
          if (blocked) return fail(blocked, 422);
          scannedPages = numPages;

          const batches = await splitPdfIntoBatches(buffer, PAGES_PER_VISION_BATCH);
          const parts = await mapWithConcurrency(
            batches,
            VISION_CONCURRENCY,
            async (batch, index) => {
              try {
                const r = await extractPdfViaOpenAI(creds.openai_api_key!, batch);
                // Recusa/estouro NESTE lote: descarta só ele em vez de perder
                // o material inteiro — um book costuma ter páginas puramente
                // decorativas (capa, foto de fachada sem texto) que a IA
                // legitimamente não tem o que transcrever.
                if (
                  r.text.includes('SEM_DADOS') ||
                  r.text.length < MIN_PDF_TEXT_CHARS ||
                  r.inputTokens > MAX_SAFE_INPUT_TOKENS
                ) {
                  console.log(JSON.stringify({
                    event: 'vision_batch_skipped',
                    batch: index,
                    chars: r.text.length,
                    input_tokens: r.inputTokens,
                  }));
                  return '';
                }
                return r.text;
              } catch (batchErr) {
                console.error(JSON.stringify({
                  event: 'vision_batch_error',
                  batch: index,
                  error: String(batchErr),
                }));
                return '';
              }
            },
          );

          const okParts = parts.filter((p) => p.length > 0);
          console.log(JSON.stringify({
            event: 'vision_batches_done',
            pages: numPages,
            batches: batches.length,
            batches_ok: okParts.length,
          }));
          // Só falha se NENHUM lote trouxe conteúdo — aí é o material inteiro
          // que a IA não conseguiu ler, não uma página decorativa.
          if (okParts.length === 0) {
            return fail(
              `A IA não conseguiu extrair conteúdo de nenhuma das ${numPages} páginas deste PDF. O arquivo pode estar protegido, corrompido, ou ser uma imagem de qualidade muito baixa.`,
              422,
            );
          }
          plaintext = okParts.join('\n\n');
        }
        // Persist file_path on the KB row so the UI can link back to it.
        await admin
          .from('knowledge_base')
          .update({ file_path: storagePath, type: 'pdf' })
          .eq('id', body.knowledge_base_id);
      } catch (err) {
        return fail(`Falha ao extrair PDF: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      return fail('source_type inválido (use text, url ou pdf).', 400);
    }

    if (!plaintext) {
      return fail('Nenhum texto extraído do source.', 400);
    }

    // 2. Clear any previous chunks for idempotent re-processing.
    await admin
      .from('knowledge_chunks')
      .delete()
      .eq('knowledge_base_id', body.knowledge_base_id);

    // 3. Chunk.
    const chunks = chunkText(plaintext);
    if (chunks.length === 0) {
      return fail('Nenhum chunk gerado do texto.', 400);
    }

    // 4. Embed in batches.
    const rows: Array<{
      org_id: string;
      knowledge_base_id: string;
      content: string;
      embedding: number[];
      metadata: Record<string, unknown>;
    }> = [];

    try {
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const vectors = await embedBatch(creds.openai_api_key, batch);
        if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBED_DIMS)) {
          throw new Error('Embeddings retornados em shape inesperado.');
        }
        batch.forEach((chunkText, idx) => {
          rows.push({
            org_id: caller.orgId,
            knowledge_base_id: body.knowledge_base_id!,
            content: chunkText,
            embedding: vectors[idx],
            metadata: { index: i + idx, source_type: body.source_type },
          });
        });
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Falha ao gerar embeddings.');
    }

    // 5. Insert chunks + flip status.
    const { error: insErr } = await admin
      .from('knowledge_chunks')
      .insert(rows);
    if (insErr) return fail(`Falha ao gravar chunks: ${insErr.message}`);

    await admin
      .from('knowledge_base')
      .update({
        status: 'ready',
        error_message: null,
        content_hash: contentHash,
        // Guardado pra que o MESMO arquivo, subido de novo, reaproveite este
        // texto em vez de pagar a leitura por IA outra vez.
        extracted_text: plaintext,
        // 0 quando não houve custo (texto/.txt/URL/PDF com texto, ou reuso por
        // hash) — esses não consomem cota.
        scanned_pages: scannedPages,
        file_size_bytes: new TextEncoder().encode(plaintext).length,
      })
      .eq('id', body.knowledge_base_id);

    // Guarda no cache pra que o MESMO arquivo, subido de novo, não pague a
    // leitura outra vez — inclusive depois do cliente apagar o material pra
    // liberar cota. Só faz sentido pra PDF (tem hash de arquivo).
    if (contentHash) {
      const { error: cacheErr } = await admin
        .from('knowledge_extraction_cache')
        .upsert(
          {
            org_id: caller.orgId,
            content_hash: contentHash,
            extracted_text: plaintext,
            scanned_pages: scannedPages,
          },
          { onConflict: 'org_id,content_hash' },
        );
      // Falha de cache não pode derrubar um processamento que já deu certo —
      // o material está pronto; no pior caso o próximo upload igual paga de novo.
      if (cacheErr) {
        console.error(JSON.stringify({ event: 'cache_write_failed', error: cacheErr.message }));
      }
    }

    return jsonResponse({
      ok: true,
      chunks: rows.length,
      total_chars: plaintext.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('process-knowledge error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
