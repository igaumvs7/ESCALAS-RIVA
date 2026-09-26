import { useCallback, useRef, useState } from 'react';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { toast } from 'sonner';
import { AlertTriangle, Download, FileArchive, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Otimizar PDF — igual ao iLovePDF (pedido do dono: "faça igual é no
// ilovepdf"). Reescrito do zero (2026-08-31): a 1ª versão RASTERIZAVA a
// página inteira (renderiza como imagem e remonta) — isso funcionava bem só
// pra PDF de foto/scaneado, mas pra PDF de texto normal (a maioria dos casos
// reais) deixava o arquivo MAIOR, porque texto vetorial é minúsculo e virar
// imagem sempre pesa mais. Bug real reportado com print: "arquivo de 69KB
// virou 411KB".
//
// A técnica é a de verdade: entra DENTRO da estrutura do PDF (via pdf-lib,
// acessando os objetos internos) e faz duas coisas, nunca tocando no texto
// em si:
// 1. Acha as FOTOS embutidas (streams com Filter DCTDecode = JPEG — o
//    formato mais comum em ficha de imóvel/contrato escaneado), decodifica
//    cada uma, recomprime/redimensiona num canvas, substitui só o stream
//    daquela imagem.
// 2. Recomprime SEM PERDA (round-trip verificado byte a byte) todo stream
//    interno que não é imagem — conteúdo de página, fonte embutida, etc. —
//    usando o Compression Streams API nativo do navegador (formato
//    'deflate' = zlib, o mesmo do FlateDecode do PDF). É o que faz um PDF
//    100% texto (sem foto nenhuma) também encolher, igual o iLovePDF faz de
//    verdade (confirmado pesquisando a implementação de compressão de PDF
//    bem avaliada do Stirling-PDF no GitHub — ferramentas de verdade não se
//    limitam a foto, recompõem a estrutura inteira do arquivo).
// Cada substituição só é aceita se o resultado for estritamente menor E o
// round-trip bater exatamente com o original — nunca arrisca corromper nem
// piorar. Se nada no PDF puder ficar menor, a ferramenta não mexe em nada.
interface QualityPreset {
  label: string;
  jpegQuality: number;
  maxDimension: number;
}
const QUALITY_PRESETS = {
  leve: { label: 'Leve — fotos bem menores', jpegQuality: 0.55, maxDimension: 1200 },
  equilibrado: { label: 'Equilibrado', jpegQuality: 0.75, maxDimension: 1600 },
  alta: { label: 'Alta qualidade — mais nítido', jpegQuality: 0.88, maxDimension: 2200 },
} satisfies Record<string, QualityPreset>;
type QualityPresetKey = keyof typeof QUALITY_PRESETS;

type ItemStatus = 'idle' | 'compressing' | 'done' | 'no-gain';

interface PdfItem {
  id: string;
  original: File;
  compressed: Blob | null;
  status: ItemStatus;
  downloadUrl: string | null;
  imagesFound: number;
  imagesRecompressed: number;
  streamsOptimized: number;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Decodifica os bytes JPEG originais, redesenha (respeitando o tamanho
// máximo do preset — nunca AUMENTA a resolução, só reduz) e recomprime.
async function recompressJpeg(
  bytes: Uint8Array,
  quality: number,
  maxDimension: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null; // JPEG que o navegador não decodifica (raro) — deixa como está
  }
  let { width, height } = bitmap;
  const largerSide = Math.max(width, height);
  if (largerSide > maxDimension) {
    const scale = maxDimension / largerSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const newBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', quality));
  return { bytes: newBytes, width, height };
}

// Roda os bytes por uma CompressionStream/DecompressionStream nativa do
// navegador (sem lib externa) e devolve o resultado como Uint8Array.
async function runThroughStream(
  input: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([input as unknown as BlobPart]).stream().pipeThrough(transform);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const STREAM_COMPRESSION_SUPPORTED =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

// Recomprime SEM PERDA qualquer stream que não seja imagem: decodifica (se
// já vier em FlateDecode) ou usa os bytes crus (se não tiver filtro nenhum),
// recomprime com deflate, e só aceita se o resultado for menor E o
// round-trip bater exatamente com os bytes decodificados originais — nunca
// arrisca trocar um byte de conteúdo de verdade, só a forma como é
// empacotado. Pula qualquer coisa fora desse caso simples (predictor via
// DecodeParms, outros filtros, streams internos de xref/objstm) — não vale
// o risco.
async function tryRecompressGenericStream(stream: PDFRawStream): Promise<Uint8Array | null> {
  if (!STREAM_COMPRESSION_SUPPORTED) return null;

  const FILTER = PDFName.of('Filter');
  const FLATE = PDFName.of('FlateDecode');
  const TYPE = PDFName.of('Type');

  const type = stream.dict.get(TYPE);
  if (type === PDFName.of('XRef') || type === PDFName.of('ObjStm')) return null;
  if (stream.dict.has(PDFName.of('DecodeParms')) || stream.dict.has(PDFName.of('Decode'))) return null;

  const filter = stream.dict.get(FILTER);
  const isPlainFlate = filter === FLATE;
  const hasNoFilter = filter === undefined;
  if (!isPlainFlate && !hasNoFilter) return null;
  if (stream.contents.length === 0) return null;

  try {
    const decoded = isPlainFlate
      ? await runThroughStream(stream.contents, new DecompressionStream('deflate'))
      : stream.contents;
    const recompressed = await runThroughStream(decoded, new CompressionStream('deflate'));
    if (recompressed.length >= stream.contents.length) return null;

    // Round-trip: confere que o que acabou de comprimir descomprime de
    // volta pro exato mesmo conteúdo — só então confia no resultado.
    const verify = await runThroughStream(recompressed, new DecompressionStream('deflate'));
    if (!bytesEqual(verify, decoded)) return null;

    return recompressed;
  } catch {
    return null;
  }
}

async function optimizePdf(
  file: File,
  preset: QualityPreset,
): Promise<{ blob: Blob; imagesFound: number; imagesRecompressed: number; streamsOptimized: number }> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = pdfDoc.context;

  const SUBTYPE = PDFName.of('Subtype');
  const IMAGE = PDFName.of('Image');
  const FILTER = PDFName.of('Filter');
  const DCT = PDFName.of('DCTDecode');
  const FLATE = PDFName.of('FlateDecode');

  let imagesFound = 0;
  let imagesRecompressed = 0;
  let streamsOptimized = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;

    if (obj.dict.get(SUBTYPE) === IMAGE) {
      if (obj.dict.get(FILTER) !== DCT) continue; // só JPEG por enquanto — outros formatos ficam intocados
      imagesFound += 1;
      const result = await recompressJpeg(obj.contents, preset.jpegQuality, preset.maxDimension);
      if (!result) continue;
      if (result.bytes.length >= obj.contents.length) continue; // nunca piora uma foto individual

      const dict = obj.dict.clone(context);
      dict.set(PDFName.of('Width'), context.obj(result.width));
      dict.set(PDFName.of('Height'), context.obj(result.height));
      dict.set(PDFName.of('BitsPerComponent'), context.obj(8));
      dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      dict.delete(PDFName.of('DecodeParms'));
      dict.delete(PDFName.of('Decode'));
      context.assign(ref, PDFRawStream.of(dict, result.bytes));
      imagesRecompressed += 1;
      continue;
    }

    // Não é imagem — tenta recompressão sem perda (conteúdo de página,
    // fonte embutida, etc.), o que faz até PDF só-texto poder encolher.
    const newBytes = await tryRecompressGenericStream(obj);
    if (!newBytes) continue;
    const dict = obj.dict.clone(context);
    dict.set(FILTER, FLATE);
    context.assign(ref, PDFRawStream.of(dict, newBytes));
    streamsOptimized += 1;
  }

  const savedBytes = await pdfDoc.save();
  return {
    blob: new Blob([savedBytes as unknown as BlobPart], { type: 'application/pdf' }),
    imagesFound,
    imagesRecompressed,
    streamsOptimized,
  };
}

export function CompressPdfTool() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [presetKey, setPresetKey] = useState<QualityPresetKey>('equilibrado');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const picked: PdfItem[] = [];
    for (const file of Array.from(list)) {
      if (file.type !== 'application/pdf') {
        toast.error(`"${file.name}" não é um PDF, foi ignorado.`);
        continue;
      }
      picked.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        original: file,
        compressed: null,
        status: 'idle',
        downloadUrl: null,
        imagesFound: 0,
        imagesRecompressed: 0,
        streamsOptimized: 0,
      });
    }
    setItems((prev) => [...prev, ...picked]);
  }, []);

  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const compressOne = async (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'compressing' } : it)));
    const target = items.find((it) => it.id === id);
    if (!target) return;
    try {
      const preset = QUALITY_PRESETS[presetKey];
      const { blob, imagesFound, imagesRecompressed, streamsOptimized } = await optimizePdf(
        target.original,
        preset,
      );

      if (blob.size >= target.original.size) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, status: 'no-gain', imagesFound, imagesRecompressed, streamsOptimized } : it,
          ),
        );
        return;
      }

      const downloadUrl = URL.createObjectURL(blob);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, compressed: blob, status: 'done', downloadUrl, imagesFound, imagesRecompressed, streamsOptimized }
            : it,
        ),
      );
    } catch (err) {
      toast.error(`Falha ao otimizar "${target.original.name}"`, {
        description: err instanceof Error ? err.message : String(err),
      });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'idle' } : it)));
    }
  };

  const compressAll = async () => {
    for (const it of items) {
      if (it.status === 'idle') {
        await compressOne(it.id);
      }
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-bold">Otimizar PDF</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Recomprime as fotos e a estrutura interna do PDF (ficha de imóvel, contrato escaneado,
            documento de texto) — igual ao iLovePDF. O texto em si nunca é alterado: continua
            selecionável e pesquisável. Processado aqui no navegador.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-text-secondary)]">Qualidade das fotos:</label>
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value as QualityPresetKey)}
            className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          >
            {(Object.entries(QUALITY_PRESETS) as [QualityPresetKey, QualityPreset][]).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.02] px-4 py-8 text-sm text-[var(--color-text-secondary)] hover:border-[rgba(var(--accent-secondary-rgb),0.45)] transition-colors"
        >
          <Upload className="h-4 w-4" />
          Clique para selecionar PDFs (pode escolher vários de uma vez)
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-1.5 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <FileArchive className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{it.original.name}</span>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">
                    {Math.round(it.original.size / 1024)} KB
                    {it.status === 'done' && it.compressed && ` → ${Math.round(it.compressed.size / 1024)} KB`}
                  </span>
                  {it.status === 'compressing' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
                  ) : it.status === 'done' && it.downloadUrl ? (
                    <a href={it.downloadUrl} download={`otimizado-${it.original.name}`}>
                      <Button size="icon" variant="ghost" type="button">
                        <Download className="h-3.5 w-3.5 text-[var(--color-success)]" />
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void compressOne(it.id)}>
                      Otimizar
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-[var(--color-error)]" />
                  </Button>
                </div>
                {it.status === 'no-gain' && (
                  <p className="flex items-center gap-1.5 pl-6 text-xs text-[#FBBF24]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Esse PDF já está no tamanho ideal — não conseguimos reduzir mais sem perder
                    qualidade. Mantivemos o arquivo original.
                  </p>
                )}
                {it.status === 'done' && (it.imagesRecompressed > 0 || it.streamsOptimized > 0) && (
                  <p className="pl-6 text-[11px] text-[var(--color-text-secondary)] opacity-70">
                    {it.imagesRecompressed > 0 &&
                      `${it.imagesRecompressed} de ${it.imagesFound} foto(s) recomprimida(s).`}
                    {it.imagesRecompressed > 0 && it.streamsOptimized > 0 && ' '}
                    {it.streamsOptimized > 0 &&
                      `${it.streamsOptimized} parte(s) da estrutura interna otimizada(s).`}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {items.length > 1 && (
          <Button type="button" variant="outline" onClick={() => void compressAll()}>
            <FileArchive className="h-4 w-4" />
            Otimizar todos de uma vez
          </Button>
        )}
      </div>
    </Card>
  );
}
