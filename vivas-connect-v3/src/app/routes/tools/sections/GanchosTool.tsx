import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ----------------------------------------------------------------------------
// Ganchos — pedido do dono: nova ferramenta com "iscas" prontas (imagem +
// texto) pra reengajar lead sumido. O gancho "Detetive" usa uma arte FIXA
// (pôster pronto, gerado por IA e escolhido pelo dono — public/ganchos/
// detetive-desaparecido.png) — só o nome do cliente e os dias sem resposta
// mudam, sobrepostos por cima da mesma imagem sempre. Regra explícita do
// dono: "se for 1 dia o certo é DIA e não DIAS, se for mais de 1 é DIAS"
// (singular/plural tratado em getDiaWord). 100% no navegador (canvas),
// nada sobe pra servidor. Estrutura em catálogo (TEMPLATES[]) pra crescer —
// cada gancho futuro só precisa de um item novo com seus campos e sua
// função de desenho.
// ----------------------------------------------------------------------------

const POSTER_SIZE = 1254; // a arte base é quadrada 1254x1254

interface GanchoField {
  id: string;
  label: string;
  placeholder: string;
  defaultValue: string;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

interface GanchoTemplate {
  id: string;
  name: string;
  description: string;
  baseImageUrl: string;
  fields: GanchoField[];
  draw: (ctx: CanvasRenderingContext2D, base: HTMLImageElement, values: Record<string, string>) => void;
}

function getDiaWord(n: number): string {
  return n === 1 ? 'DIA' : 'DIAS';
}

// Escreve `text` centralizado em (cx, cy), diminuindo a fonte até caber em
// `maxWidth` (nome de cliente pode ser bem mais longo que "NOME DO CLIENTE").
function fitCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  startSize: number,
  minSize: number,
) {
  let size = startSize;
  ctx.font = `${size}px Anton, Arial, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${size}px Anton, Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

const TEMPLATES: GanchoTemplate[] = [
  {
    id: 'detetive-desaparecido',
    name: 'Detetive — Cliente sumiu',
    description: 'Pôster pronto de "desaparecido" — só o nome do cliente e os dias sem resposta mudam.',
    baseImageUrl: '/ganchos/detetive-desaparecido.png',
    fields: [
      {
        id: 'genero',
        label: 'Cliente é',
        placeholder: '',
        defaultValue: 'M',
        type: 'select',
        options: [
          { value: 'M', label: 'Homem — "O cliente"' },
          { value: 'F', label: 'Mulher — "A cliente"' },
        ],
      },
      { id: 'nome', label: 'Nome do cliente', placeholder: 'João', defaultValue: '' },
      { id: 'dias', label: 'Dias sem responder', placeholder: '2', defaultValue: '', type: 'number' },
    ],
    draw: (ctx, base, values) => {
      const nome = (values.nome || 'NOME DO CLIENTE').trim().toUpperCase();
      const diasNum = Math.max(1, Math.round(Number(values.dias)) || 1);
      const palavra = getDiaWord(diasNum);
      const artigo = values.genero === 'F' ? 'A' : 'O';

      ctx.drawImage(base, 0, 0, POSTER_SIZE, POSTER_SIZE);

      // Tapa "O CLIENTE" (fundo preto original) e escreve "O"/"A CLIENTE"
      // de acordo com o gênero — pedido do dono: "se for mulher tem que
      // por A CLIENTE". Faixa calibrada com o mesmo script de pixel usado
      // nas outras duas regiões (bounding box real: x 728-1110, y 438-524).
      ctx.fillStyle = '#020202';
      ctx.fillRect(715, 425, 410, 110);
      ctx.fillStyle = '#F2F0EC';
      fitCenteredText(ctx, `${artigo} CLIENTE`, 715 + 410 / 2, 425 + 110 / 2 + 4, 390, 108, 40);

      // Tapa "NOME DO CLIENTE" (tarja clara original) e escreve o nome real.
      // Margem generosa: a fonte original tem serifa/sombra que passava um
      // pouco do retângulo estimado a princípio (bug real visto no teste —
      // sobrava rabisco preto embaixo do nome novo).
      ctx.fillStyle = 'rgb(217,218,218)';
      ctx.fillRect(650, 540, 555, 100);
      ctx.fillStyle = '#141414';
      fitCenteredText(ctx, nome, 650 + 555 / 2, 540 + 100 / 2 + 2, 520, 60, 26);

      // Tapa "X DIAS" (fundo preto original) e escreve o número + DIA/DIAS.
      // Faixa calibrada com precisão de pixel (script próprio de calibração):
      // "ESTÁ A" (linha de cima, imutável) desce até y≈709 e "SEM ME
      // RESPONDER" (linha de baixo, imutável) começa em y≈891 — as duas
      // quase encostam na linha "X DIAS", só ~5px de folga de cada lado.
      // Um retângulo maior (como a 1ª tentativa, y=685) cortava a base de
      // "ESTÁ A" — bug real reportado pelo dono com print ("ESTÁ A está
      // espremido").
      ctx.fillStyle = '#020202';
      ctx.fillRect(700, 710, 545, 176);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const numText = String(diasNum);
      let fontSize = 155;
      ctx.font = `${fontSize}px Anton, Arial, sans-serif`;
      const gap = 22;
      let numWidth = ctx.measureText(numText).width;
      let wordWidth = ctx.measureText(palavra).width;
      // Diminui junto se "NN DIAS" não couber na faixa (ex: nome de dias
      // com 2 dígitos + DIAS).
      while (numWidth + gap + wordWidth > 520 && fontSize > 70) {
        fontSize -= 6;
        ctx.font = `${fontSize}px Anton, Arial, sans-serif`;
        numWidth = ctx.measureText(numText).width;
        wordWidth = ctx.measureText(palavra).width;
      }
      const totalWidth = numWidth + gap + wordWidth;
      const startX = 700 + (545 - totalWidth) / 2;
      const baselineY = 710 + 148;

      ctx.fillStyle = '#D4941A';
      ctx.fillText(numText, startX, baselineY);
      ctx.fillStyle = '#F2F0EC';
      ctx.fillText(palavra, startX + numWidth + gap, baselineY);

      // Tapa "DESAPARECIDO" (faixa vermelha original) e escreve
      // DESAPARECIDO/DESAPARECIDA de acordo com o gênero — pedido do dono:
      // "tem que mudar o desaparecido e desaparecida". Cor da faixa
      // amostrada por pixel (vermelho ~rgb(159,8,7)).
      // 1ª tentativa (y=950, altura 105) deixou sobra visível da base do
      // "DESAPARECIDO" original — a faixa vermelha/texto vai até y≈1075,
      // não 1055 (bug real visto no teste, mesmo padrão do "NOME DO
      // CLIENTE" antes).
      const desaparecidoTxt = values.genero === 'F' ? 'DESAPARECIDA' : 'DESAPARECIDO';
      ctx.fillStyle = 'rgb(159,8,7)';
      ctx.fillRect(650, 948, 585, 130);
      ctx.fillStyle = '#0A0A0A';
      fitCenteredText(ctx, desaparecidoTxt, 650 + 585 / 2, 948 + 130 / 2 + 4, 560, 100, 40);
    },
  },
  {
    id: 'carro-zero',
    name: 'Carro zero — Quer andar, mas não responde',
    description: 'Isca pronta, sem campos pra preencher — já sai pronta pra baixar e mandar.',
    baseImageUrl: '/ganchos/carro-zero.png',
    fields: [],
    draw: (ctx, base) => {
      ctx.drawImage(base, 0, 0, POSTER_SIZE, POSTER_SIZE);
    },
  },
  {
    id: 'churrasco-cliente',
    name: 'Apartamento — Poderia ser meu/minha cliente',
    description: 'Isca pronta de reengajamento — o texto muda de acordo com o gênero do cliente.',
    baseImageUrl: '/ganchos/churrasco-cliente.png',
    fields: [
      {
        id: 'genero',
        label: 'Cliente é',
        placeholder: '',
        defaultValue: 'M',
        type: 'select',
        options: [
          { value: 'M', label: 'Homem — "meu cliente... ele"' },
          { value: 'F', label: 'Mulher — "minha cliente... ela"' },
        ],
      },
    ],
    draw: (ctx, base, values) => {
      const isFem = values.genero === 'F';
      const linha1 = isFem ? 'MINHA CLIENTE,' : 'MEU CLIENTE,';
      const linha2 = isFem ? 'MAS ELA NÃO' : 'MAS ELE NÃO';

      ctx.drawImage(base, 0, 0, POSTER_SIZE, POSTER_SIZE);

      // Tapa as duas linhas dinâmicas (fundo do balão de fala, preto sólido)
      // e escreve por cima — calibrado com o mesmo script de pixel dos
      // outros ganchos (texto original ocupa x 660-1145, y 225-430).
      ctx.fillStyle = '#000000';
      ctx.fillRect(625, 218, 585, 222);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Fontes um pouco menores + mais espaço entre as linhas do que a 1ª
      // tentativa — "NÃO" (com til) encostava em "CLIENTE," (bug real visto
      // no teste).
      let size1 = 100;
      ctx.font = `${size1}px Anton, Arial, sans-serif`;
      while (ctx.measureText(linha1).width > 560 && size1 > 50) {
        size1 -= 4;
        ctx.font = `${size1}px Anton, Arial, sans-serif`;
      }
      ctx.fillStyle = 'rgb(0,52,204)';
      ctx.fillText(linha1, 660, 295);

      let size2 = 95;
      ctx.font = `${size2}px Anton, Arial, sans-serif`;
      while (ctx.measureText(linha2).width > 560 && size2 > 50) {
        size2 -= 4;
        ctx.font = `${size2}px Anton, Arial, sans-serif`;
      }
      ctx.fillStyle = '#F2F0EC';
      ctx.fillText(linha2, 660, 415);
    },
  },
];

export function GanchosTool() {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.fields.map((f) => [f.id, f.defaultValue])),
  );
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
    setValues(Object.fromEntries(t.fields.map((f) => [f.id, f.defaultValue])));
  };

  // Carrega a arte fixa do gancho escolhido.
  useEffect(() => {
    setBaseImage(null);
    const img = new window.Image();
    img.onload = () => setBaseImage(img);
    img.src = template.baseImageUrl;
  }, [template.baseImageUrl]);

  const redraw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;
    setRendering(true);
    try {
      await Promise.all([document.fonts.load('60px Anton'), document.fonts.load('170px Anton')]);
    } catch {
      // segue mesmo se a fonte falhar em carregar — cai no fallback (Arial)
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setRendering(false);
      return;
    }
    canvas.width = POSTER_SIZE;
    canvas.height = POSTER_SIZE;
    template.draw(ctx, baseImage, values);
    setRendering(false);
  }, [baseImage, template, values]);

  useEffect(() => {
    void redraw();
  }, [redraw]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nomeSlug = (values.nome || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.download = `gancho-${template.id}-${nomeSlug}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <Card>
      <div className="space-y-5">
        <header>
          <h2 className="text-lg font-bold">Ganchos</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Modelos prontos de imagem + texto pra reengajar quem sumiu na conversa. Preenche os campos,
            baixa a imagem e manda no WhatsApp. Processado aqui no navegador.
          </p>
        </header>

        {TEMPLATES.length > 1 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
              Escolha o modelo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TEMPLATES.map((t) => {
                const selected = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    aria-pressed={selected}
                    className={`group flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                      selected
                        ? 'border-[var(--accent-primary)] bg-[rgba(var(--accent-secondary-rgb),0.12)] shadow-[0_0_0_1px_var(--accent-primary)]'
                        : 'border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] hover:border-[rgba(var(--accent-primary-rgb),0.5)] hover:bg-white/[0.04]'
                    }`}
                  >
                    <img
                      src={t.baseImageUrl}
                      alt=""
                      className={`h-14 w-14 shrink-0 rounded-lg object-cover border transition-colors ${
                        selected ? 'border-[var(--accent-primary)]' : 'border-white/10'
                      }`}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-bold leading-tight truncate ${
                          selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)] opacity-90'
                        }`}
                      >
                        {t.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] leading-snug line-clamp-2 mt-0.5">
                        {t.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-6">
          <div className="space-y-4">
            {template.fields.map((f) => (
              <div key={f.id} className="space-y-2">
                <Label htmlFor={`gancho-${f.id}`}>{f.label}</Label>
                {f.type === 'select' ? (
                  <select
                    id={`gancho-${f.id}`}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`gancho-${f.id}`}
                    type={f.type ?? 'text'}
                    min={f.type === 'number' ? 1 : undefined}
                    value={values[f.id] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}

            <Button type="button" onClick={handleDownload} disabled={!baseImage || rendering}>
              {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar imagem
            </Button>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-[460px] rounded-lg overflow-hidden border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.02]">
              {baseImage ? (
                <canvas ref={canvasRef} className="w-full h-auto block" />
              ) : (
                <div className="aspect-square flex items-center justify-center text-[var(--color-text-secondary)] opacity-60">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
