import { useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { FileOutput, Loader2, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Converter pra PDF: 4 caminhos diferentes por tipo de arquivo, todos no
// navegador. Foto e .txt saem com qualidade perfeita (pdf-lib puro,
// vetorial). Word e Excel passam por HTML -> captura de tela -> PDF —
// funciona bem pra documentos simples, mas não é pixel-perfeito em layouts
// muito elaborados (é o limite real de converter no navegador, sem
// depender de um serviço pago por conversão).
const ACCEPTED = '.txt,.docx,.xlsx,image/*';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

async function imageToPdf(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.create();
  const isPng = file.type === 'image/png';
  const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await doc.save();
  return new Blob([out], { type: 'application/pdf' });
}

async function txtToPdf(file: File): Promise<Blob> {
  const text = await file.text();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = fontSize * 1.4;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;

  // Quebra de linha manual: respeita as quebras originais e ainda estoura
  // linhas longas demais pra caber na largura da página.
  const rawLines = text.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    let current = '';
    for (const word of raw.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  const out = await doc.save();
  return new Blob([out], { type: 'application/pdf' });
}

// Caminho comum pra Word e Excel: renderiza o HTML gerado numa div escondida,
// tira uma "foto" (html2canvas) e fatia em páginas A4 dentro do PDF.
async function htmlToPdf(html: string): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '780px';
  container.style.background = '#ffffff';
  container.style.color = '#000000';
  container.style.padding = '24px';
  container.style.fontFamily = 'Arial, sans-serif';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

async function docxToPdf(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToPdf(html);
}

async function xlsxToPdf(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetHtmls = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const html = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
    return `<h3 style="font-size:14px;margin:16px 0 8px">${name}</h3>${html}`;
  });
  const style = `<style>
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    td, th { border: 1px solid #999; padding: 4px 6px; }
  </style>`;
  return htmlToPdf(style + sheetHtmls.join(''));
}

function detectKind(file: File): 'image' | 'txt' | 'docx' | 'xlsx' | null {
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'txt') return 'txt';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  return null;
}

export function ConvertToPdfTool() {
  const [converting, setConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const kind = detectKind(file);
    if (!kind) {
      toast.error(`"${file.name}" não é suportado ainda. Aceito: foto, .txt, .docx, .xlsx.`);
      return;
    }
    setConverting(true);
    try {
      let blob: Blob;
      if (kind === 'image') blob = await imageToPdf(file);
      else if (kind === 'txt') blob = await txtToPdf(file);
      else if (kind === 'docx') blob = await docxToPdf(file);
      else blob = await xlsxToPdf(file);

      downloadBlob(blob, `${baseName(file.name)}.pdf`);
      toast.success('PDF gerado com sucesso.');
    } catch (err) {
      toast.error('Falha ao converter', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-bold">Converter para PDF</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Aceita foto (JPG/PNG), texto (.txt), Word (.docx) e Excel (.xlsx). Foto e texto saem
            com qualidade perfeita; Word e Excel ficam ótimos pra documentos simples — layouts
            muito elaborados podem sair um pouco diferentes do original.
          </p>
        </header>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={converting}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.02] px-4 py-8 text-sm text-[var(--color-text-secondary)] hover:border-[rgba(var(--accent-secondary-rgb),0.45)] transition-colors disabled:opacity-50"
        >
          {converting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Convertendo...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Clique para selecionar um arquivo (foto, .txt, .docx ou .xlsx)
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />

        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <FileOutput className="h-3.5 w-3.5" />
          O PDF baixa automaticamente assim que fica pronto.
        </div>
      </div>
    </Card>
  );
}
