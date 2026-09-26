// ----------------------------------------------------------------------------
// image-compress — otimiza foto no navegador ANTES de subir pro Storage.
// ----------------------------------------------------------------------------
// Pedido do dono, 2026-09-25: com 100 clientes usando o Vivas Perfil, foto de
// celular sem compressão (facilmente 2-4MB cada) pode estourar o limite
// gratuito de transferência do Supabase Storage quando os sites recebem
// visita de verdade — ver `BANCOS VIVAS CONNECT/SUPABASE/README.md`. Rodar
// isso no navegador (não precisa de servidor novo) reduz o peso da imagem
// tipicamente em 80-90% sem perda visível.
//
// Regras que o dono pediu explicitamente pra nunca quebrar:
// - NUNCA distorcer: a escala aplicada em largura e altura é sempre a MESMA
//   (proporção preservada, nunca "esmaga" a imagem).
// - NUNCA perder qualidade perceptível: só reduz a resolução se a imagem for
//   maior que o necessário pra tela (1600px no lado maior já é bem mais que
//   qualquer exibição no site), e usa WebP com qualidade 0.86 (bem acima do
//   ponto onde artefato de compressão fica visível a olho nu).
// - Se por qualquer motivo a otimização falhar (formato exótico, navegador
//   sem suporte) ou o resultado não ficar menor, sobe o arquivo ORIGINAL —
//   nunca trava o upload por causa disso.
// ----------------------------------------------------------------------------

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.86;
// Arquivo já pequeno o suficiente — comprimir de novo só arriscaria piorar a
// qualidade à toa pra economizar quase nada.
const SKIP_BELOW_BYTES = 150 * 1024;

function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  // Mesma escala nos dois eixos — é isso que garante que nunca distorce.
  const scale = width > height ? max / width : max / height;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// createImageBitmap com imageOrientation:'from-image' respeita a rotação
// EXIF da foto (comum em foto de celular) — sem isso, algumas fotos podem
// aparecer "deitadas" depois de recomprimidas. Cai pro <img> normal (que os
// navegadores atuais também corrigem sozinhos) se não tiver suporte.
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // formato não suportado por createImageBitmap — tenta o outro caminho
    }
  }
  return loadHtmlImage(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  try {
    const source = await loadBitmap(file);
    const sourceWidth = 'width' in source ? source.width : 0;
    const sourceHeight = 'height' in source ? source.height : 0;
    if (!sourceWidth || !sourceHeight) return file;

    const { width, height } = fitWithinMax(sourceWidth, sourceHeight, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, width, height);
    if ('close' in source) source.close();

    const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], newName, { type: 'image/webp' });
  } catch {
    return file;
  }
}
