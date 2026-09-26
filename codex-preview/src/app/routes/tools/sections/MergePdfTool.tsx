import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  FileStack,
  FileWarning,
  GripVertical,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PickedFile {
  id: string;
  file: File;
  thumbnailUrl: string | null;
  thumbnailFailed: boolean;
}

// Renderiza a 1ª página do PDF numa imagem — usado tanto pra miniatura
// pequena da lista quanto pra prévia ampliada (clique na miniatura). Pedido
// do dono ("quero poder ver os PDFs que eu adicionei, tipo uma prévia...
// as vezes a gente não lembra pelo nome" + depois "clicar no quadrado e ver
// uma prévia... dar um zoom, aí eu clico no x e ela sai"). Só a IMAGEM da
// página é gerada aqui pra preview visual — o PDF final continua sendo
// montado com os bytes originais via pdf-lib (handleMerge abaixo), o
// texto/qualidade de verdade nunca passa por essa rasterização.
async function renderPdfPageImage(file: File, targetWidth: number): Promise<string | null> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL('image/png');
  } catch {
    return null; // PDF corrompido/protegido — mostra um ícone de aviso em vez de travar a lista
  }
}

const THUMBNAIL_WIDTH = 110;
const PREVIEW_WIDTH = 900;

interface FileRowProps {
  f: PickedFile;
  i: number;
  total: number;
  move: (index: number, dir: -1 | 1) => void;
  remove: (id: string) => void;
  onPreview: (f: PickedFile) => void;
}

// Linha arrastável — pedido do dono ("quero poder arrastar os arquivos na
// ordem que eu quero, não ficar dependente das setas"). O ícone de "grip"
// é a alça de arraste (dnd-kit); as setas continuam do lado, pra quem
// preferir um reordenamento mais preciso passo a passo.
function FileRow({ f, i, total, move, remove, onPreview }: FileRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const canPreview = !!f.thumbnailUrl && !f.thumbnailFailed;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02] px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-[var(--color-text-secondary)] opacity-60 hover:opacity-100 active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => canPreview && onPreview(f)}
        disabled={!canPreview}
        className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.03] transition-transform enabled:cursor-zoom-in enabled:hover:scale-105 enabled:hover:border-[var(--accent-primary)]"
        aria-label={canPreview ? 'Ver prévia da página' : undefined}
      >
        {f.thumbnailUrl ? (
          <img src={f.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : f.thumbnailFailed ? (
          <FileWarning className="h-4 w-4 text-[var(--color-text-secondary)] opacity-60" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-secondary)] opacity-60" />
        )}
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
      <span className="text-[11px] text-[var(--color-text-secondary)]">
        {Math.round(f.file.size / 1024)} KB
      </span>
      <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" disabled={i === total - 1} onClick={() => move(i, 1)}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => remove(f.id)}>
        <Trash2 className="h-3.5 w-3.5 text-[var(--color-error)]" />
      </Button>
    </div>
  );
}

// Unir PDFs: 100% no navegador (pdf-lib), nenhum arquivo sobe pro servidor —
// mais rápido e não conta contra nenhum limite de storage.
export function MergePdfTool() {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [merging, setMerging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  // Prévia ampliada — clique na miniatura ("clicar no quadrado... dar um
  // zoom nessa foto na minha tela, aí eu clico no x e ela sai"). Renderiza
  // sob demanda (só quando clica), numa resolução maior que a miniatura.
  const [previewFile, setPreviewFile] = useState<PickedFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = useCallback((f: PickedFile) => {
    setPreviewFile(f);
    setPreviewUrl(null);
    setPreviewLoading(true);
    void renderPdfPageImage(f.file, PREVIEW_WIDTH).then((url) => {
      setPreviewLoading(false);
      setPreviewUrl(url);
    });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (!previewFile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewFile, closePreview]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const picked: PickedFile[] = [];
    for (const file of Array.from(list)) {
      if (file.type !== 'application/pdf') {
        toast.error(`"${file.name}" não é um PDF, foi ignorado.`);
        continue;
      }
      picked.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        thumbnailUrl: null,
        thumbnailFailed: false,
      });
    }
    setFiles((prev) => [...prev, ...picked]);

    // Gera a miniatura de cada arquivo recém-adicionado em segundo plano —
    // não bloqueia a UI, cada uma atualiza a linha assim que fica pronta.
    for (const p of picked) {
      void renderPdfPageImage(p.file, THUMBNAIL_WIDTH).then((url) => {
        setFiles((prev) =>
          prev.map((it) => (it.id === p.id ? { ...it, thumbnailUrl: url, thumbnailFailed: url === null } : it)),
        );
      });
    }
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFiles((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      toast.error('Selecione pelo menos 2 arquivos PDF pra unir.');
      return;
    }
    setMerging(true);
    try {
      const output = await PDFDocument.create();
      for (const { file } of files) {
        const bytes = await file.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const pages = await output.copyPages(src, src.getPageIndices());
        pages.forEach((p) => output.addPage(p));
      }
      const mergedBytes = await output.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'documento-unido.pdf';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${files.length} PDFs unidos com sucesso.`);
    } catch (err) {
      toast.error('Falha ao unir os PDFs', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMerging(false);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-bold">Unir PDFs</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Selecione vários PDFs, ordene como quiser e junte tudo em um arquivo só. O
            processamento acontece aqui no navegador — nada é enviado pra nenhum servidor.
          </p>
        </header>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.02] px-4 py-8 text-sm text-[var(--color-text-secondary)] hover:border-[rgba(var(--accent-secondary-rgb),0.45)] transition-colors"
        >
          <Upload className="h-4 w-4" />
          Clique para selecionar arquivos PDF (pode escolher vários de uma vez)
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

        {files.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {files.map((f, i) => (
                  <FileRow
                    key={f.id}
                    f={f}
                    i={i}
                    total={files.length}
                    move={move}
                    remove={remove}
                    onPreview={openPreview}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button type="button" onClick={handleMerge} disabled={merging || files.length < 2}>
          {merging ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Unindo...
            </>
          ) : (
            <>
              <FileStack className="h-4 w-4" />
              Unir e baixar PDF
            </>
          )}
        </Button>
      </div>

      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closePreview}
              className="absolute -top-4 -right-4 rounded-full border border-[rgba(var(--accent-secondary-rgb),0.3)] bg-[var(--bg-primary)] p-1.5 text-[var(--color-text-primary)] shadow-lg hover:bg-white/10"
              aria-label="Fechar prévia"
            >
              <X className="h-4 w-4" />
            </button>
            {previewLoading ? (
              <div className="flex h-80 w-60 items-center justify-center rounded-lg bg-white/5">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={previewFile.file.name}
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <div className="flex h-80 w-60 items-center justify-center rounded-lg bg-white/5 px-4 text-center text-sm text-white/70">
                Não foi possível gerar a prévia dessa página.
              </div>
            )}
            <p className="mt-2 truncate text-center text-xs text-white/70">{previewFile.file.name}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
