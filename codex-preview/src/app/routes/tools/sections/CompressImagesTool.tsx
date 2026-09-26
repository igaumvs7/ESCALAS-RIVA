import { useCallback, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { encode as encodeMozjpeg } from '@jsquash/jpeg';
import { toast } from 'sonner';
import { Download, ImageDown, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ImageItem {
  id: string;
  original: File;
  compressed: File | null;
  compressing: boolean;
  downloadUrl: string | null;
}

const MAX_DIMENSION = 2000;

// Otimizar imagens: 100% no navegador. Pedido do dono ("quando eu tento
// otimizar imagem fica bem ruim") + pesquisa em fonte bem avaliada: o
// encoder JPEG nativo do canvas (usado antes, via browser-image-compression)
// é uma caixa-preta sem controle fino — produz arquivo 10-20% maior pra
// mesma qualidade visual, comparado a um encoder de verdade. Trocado pelo
// MozJPEG (a mesma lib usada pelo Squoosh do Google Chrome Labs e pelo
// próprio Firefox) compilado pra WASM via jSquash — um projeto ativo,
// derivado do Squoosh, ~700 estrelas no GitHub. Fotos de imóvel (JPEG, o
// caso mais comum) passam por ele; qualquer outro formato (PNG, WebP etc)
// continua no caminho antigo, que já era adequado pra esses casos.
async function decodeToImageData(file: File, maxDimension: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
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
  if (!ctx) throw new Error('Canvas 2D indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

// Busca binária na qualidade do MozJPEG (0-100) até achar a maior qualidade
// que ainda cabe no tamanho alvo — nunca reduz a qualidade além do
// necessário pra atingir o tamanho escolhido.
async function encodeJpegToTargetSize(imageData: ImageData, targetBytes: number): Promise<Uint8Array> {
  const encodeAt = async (quality: number) => new Uint8Array(await encodeMozjpeg(imageData, { quality }));

  const atMaxQuality = await encodeAt(95);
  if (atMaxQuality.length <= targetBytes) return atMaxQuality;

  let lo = 10;
  let hi = 94;
  let best = await encodeAt(lo);
  while (lo <= hi) {
    const mid = Math.round((lo + hi) / 2);
    const result = await encodeAt(mid);
    if (result.length <= targetBytes) {
      best = result;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

async function compressImage(file: File, maxSizeMB: number): Promise<File> {
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
  if (isJpeg) {
    try {
      const imageData = await decodeToImageData(file, MAX_DIMENSION);
      const targetBytes = maxSizeMB * 1024 * 1024;
      const encoded = await encodeJpegToTargetSize(imageData, targetBytes);
      return new File([encoded as unknown as BlobPart], file.name, { type: 'image/jpeg' });
    } catch {
      // MozJPEG falhou (formato inesperado, WASM indisponível etc.) — cai
      // no caminho antigo em vez de travar o usuário sem resultado nenhum.
    }
  }
  return imageCompression(file, { maxSizeMB, maxWidthOrHeight: MAX_DIMENSION, useWebWorker: true });
}
export function CompressImagesTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [maxSizeMB, setMaxSizeMB] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const picked: ImageItem[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" não é uma imagem, foi ignorado.`);
        continue;
      }
      picked.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        original: file,
        compressed: null,
        compressing: false,
        downloadUrl: null,
      });
    }
    setItems((prev) => [...prev, ...picked]);
  }, []);

  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const compressOne = async (id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, compressing: true } : it)));
    const target = items.find((it) => it.id === id);
    if (!target) return;
    try {
      const compressed = await compressImage(target.original, maxSizeMB);
      const downloadUrl = URL.createObjectURL(compressed);
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, compressed, compressing: false, downloadUrl } : it)),
      );
    } catch (err) {
      toast.error(`Falha ao otimizar "${target.original.name}"`, {
        description: err instanceof Error ? err.message : String(err),
      });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, compressing: false } : it)));
    }
  };

  const compressAll = async () => {
    for (const it of items) {
      if (!it.compressed && !it.compressing) {
        await compressOne(it.id);
      }
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-bold">Otimizar imagens</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Reduz o tamanho de fotos sem perder qualidade visível — bom pra deixar o site do
            corretor rápido e economizar espaço. Processado aqui no navegador.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-text-secondary)]">Tamanho alvo:</label>
          <select
            value={maxSizeMB}
            onChange={(e) => setMaxSizeMB(Number(e.target.value))}
            className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          >
            <option value={0.3}>Bem leve (~300KB)</option>
            <option value={1}>Equilibrado (~1MB)</option>
            <option value={2}>Alta qualidade (~2MB)</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.02] px-4 py-8 text-sm text-[var(--color-text-secondary)] hover:border-[rgba(var(--accent-secondary-rgb),0.45)] transition-colors"
        >
          <Upload className="h-4 w-4" />
          Clique para selecionar imagens (pode escolher várias de uma vez)
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
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
                className="flex items-center gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02] px-3 py-2"
              >
                <ImageDown className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
                <span className="min-w-0 flex-1 truncate text-sm">{it.original.name}</span>
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {Math.round(it.original.size / 1024)} KB
                  {it.compressed && ` → ${Math.round(it.compressed.size / 1024)} KB`}
                </span>
                {it.compressing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
                ) : it.downloadUrl ? (
                  <a href={it.downloadUrl} download={`otimizada-${it.original.name}`}>
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
            ))}
          </div>
        )}

        {items.length > 1 && (
          <Button type="button" variant="outline" onClick={() => void compressAll()}>
            <ImageDown className="h-4 w-4" />
            Otimizar todas de uma vez
          </Button>
        )}
      </div>
    </Card>
  );
}
