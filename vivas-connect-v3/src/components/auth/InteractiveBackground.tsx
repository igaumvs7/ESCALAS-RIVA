import { useEffect, useRef } from 'react';
import { useTheme } from '@/app/providers/ThemeProvider';

// ----------------------------------------------------------------------------
// InteractiveBackground — fundo do painel de login, reagindo ao cursor de
// verdade (pedido do dono, várias vezes: "antes tinha umas linhas que ao eu
// mexer o cursor... mexiam e era MUITO BOM", "não quero holofote/glow, quero
// algo bonito, elaborado e TEMATIZADO — o do mar parecendo onda, o da
// aurora fazendo o que ela faz no céu").
//
// Canvas 2D (não CSS) porque o efeito pedido — uma grade que se deforma perto
// do cursor, ondas que sobem de amplitude, faixas de aurora fluindo — precisa
// de posição calculada ponto a ponto a cada frame, não dá pra fazer só com
// gradientes/máscaras CSS. Um "renderer" diferente por grupo de tema; a cor
// vem sempre de --accent-primary-rgb/--accent-secondary-rgb (lidas do
// elemento em runtime), então cada tema já sai colorido certo sem duplicar
// hex aqui.
// ----------------------------------------------------------------------------

type ThemeGroup = 'grid' | 'waves' | 'aurora' | 'sun' | 'storm' | 'rain' | 'matrix';

function groupForTheme(themeId: string): ThemeGroup {
  if (themeId === 'profundezas-do-oceano') return 'waves';
  if (themeId === 'aurora-boreal') return 'aurora';
  if (themeId === 'sol-do-meio-dia' || themeId === 'praia-de-domingo') return 'sun';
  if (themeId === 'tempestade') return 'storm';
  if (themeId === 'escuridao') return 'rain';
  if (themeId === 'hacker') return 'matrix';
  return 'grid';
}

interface Colors {
  primary: string; // "r, g, b"
  secondary: string;
}

function readColors(el: HTMLElement): Colors {
  const style = getComputedStyle(el);
  return {
    primary: style.getPropertyValue('--accent-primary-rgb').trim() || '232, 185, 74',
    secondary: style.getPropertyValue('--accent-secondary-rgb').trim() || '36, 81, 217',
  };
}

// ---- Grupo "grid" — grade de pontos que se afasta do cursor (o efeito
// clássico que o dono lembrava com carinho), com linhas conectando os pontos
// já deslocados — visualmente "o tecido se deformando" perto do mouse.
// IMPORTANTE: essa é a grade dos temas "clássicos" (inclui o tema padrão,
// primeira impressão de todo mundo) — por isso não pode depender só do
// cursor pra "estar viva". Cada ponto respira sozinho (opacidade oscilando
// devagar, defasada por posição) e a linha de base já sai visível — antes
// disso o parado era tão fraco que dava a impressão de "nada mudou". ----
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number, c: Colors, time: number) {
  const spacing = 46;
  const radius = 210;
  const strength = 26;
  const cols = Math.ceil(w / spacing) + 2;
  const rows = Math.ceil(h / spacing) + 2;
  const xs: number[][] = [];
  const ys: number[][] = [];
  const near: number[][] = [];

  for (let j = 0; j < rows; j++) {
    xs[j] = []; ys[j] = []; near[j] = [];
    for (let i = 0; i < cols; i++) {
      const bx = i * spacing;
      const by = j * spacing;
      const dx = bx - mx;
      const dy = by - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let x = bx;
      let y = by;
      let n = 0;
      if (dist < radius) {
        n = 1 - dist / radius;
        const force = n * strength;
        const ang = Math.atan2(dy, dx);
        x += Math.cos(ang) * force;
        y += Math.sin(ang) * force;
      }
      xs[j][i] = x; ys[j][i] = y; near[j][i] = n;
    }
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${c.secondary}, 0.26)`;
  ctx.beginPath();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (i > 0) { ctx.moveTo(xs[j][i - 1], ys[j][i - 1]); ctx.lineTo(xs[j][i], ys[j][i]); }
      if (j > 0) { ctx.moveTo(xs[j - 1][i], ys[j - 1][i]); ctx.lineTo(xs[j][i], ys[j][i]); }
    }
  }
  ctx.stroke();

  // Ponto em TODA intersecção (não só perto do cursor) com uma respiração
  // lenta e defasada — é o que faz o fundo parecer "vivo" mesmo parado.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const n = near[j][i];
      const breathe = 0.5 + 0.5 * Math.sin(time * 0.018 + i * 0.6 + j * 0.6);
      const baseAlpha = 0.16 + breathe * 0.14;
      const alpha = Math.min(0.95, baseAlpha + n * 0.7);
      const r = 1.1 + breathe * 0.6 + n * 2.2;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${c.primary}, ${alpha})`;
      ctx.arc(xs[j][i], ys[j][i], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- Grupo "waves" — linhas horizontais tipo mar, ganhando amplitude perto
// do cursor + bolhas subindo. "Passar o mouse na onda" literalmente mexe a
// onda daquela faixa. ----
interface Bubble { x: number; y: number; r: number; speed: number; drift: number; }
let bubblePool: Bubble[] | null = null;

function ensureBubbles(w: number, h: number): Bubble[] {
  if (!bubblePool) {
    bubblePool = Array.from({ length: 22 }, () => ({
      x: Math.random() * w,
      y: h + Math.random() * h,
      r: 1 + Math.random() * 2.2,
      speed: 0.25 + Math.random() * 0.5,
      drift: Math.random() * Math.PI * 2,
    }));
  }
  return bubblePool;
}

function drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number, c: Colors, time: number) {
  const lineCount = 6;
  for (let l = 0; l < lineCount; l++) {
    const baseY = h * (0.16 + l * 0.135);
    const distY = Math.abs(my - baseY);
    const influence = Math.max(0, 1 - distY / 240);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const distX = Math.abs(x - mx);
      const localBoost = influence * Math.max(0, 1 - distX / 300);
      const y =
        baseY +
        Math.sin(x * 0.012 + time * (0.02 + l * 0.002) + l) * (9 + influence * 18) +
        Math.sin(x * 0.03 + time * 0.035) * (3 + localBoost * 14);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${c.secondary}, ${0.18 + influence * 0.28})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const bubbles = ensureBubbles(w, h);
  for (const b of bubbles) {
    b.y -= b.speed;
    b.x += Math.sin(time * 0.02 + b.drift) * 0.3;
    if (b.y < -10) {
      b.y = h + 10;
      b.x = Math.random() * w;
    }
    const dx = b.x - mx;
    const dy = b.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = Math.max(0, 1 - dist / 140);
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${c.primary}, ${0.28 + near * 0.5})`;
    ctx.lineWidth = 1;
    ctx.arc(b.x, b.y, b.r + near * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---- Grupo "aurora" — faixas fluindo tipo cortina de luz no céu, mudando de
// forma com o tempo E com a posição horizontal do cursor. ----
function drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, _my: number, c: Colors, time: number) {
  const bands = 3;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const cursorShift = (mx / Math.max(w, 1) - 0.5) * 60;

  for (let b = 0; b < bands; b++) {
    const baseY = h * (0.06 + b * 0.1);
    const amp = 34 + b * 12;
    ctx.beginPath();
    ctx.moveTo(-20, baseY);
    for (let x = -20; x <= w + 20; x += 22) {
      const y =
        baseY +
        Math.sin(x * 0.006 + time * (0.012 + b * 0.003) + b * 2 + cursorShift * 0.02) * amp +
        Math.sin(x * 0.016 - time * 0.01) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 20, baseY - 90 - b * 10);
    ctx.lineTo(-20, baseY - 90 - b * 10);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, baseY - 70, 0, baseY + 50);
    grad.addColorStop(0, `rgba(${c.primary}, 0)`);
    grad.addColorStop(0.55, `rgba(${c.primary}, ${0.1 + b * 0.02})`);
    grad.addColorStop(1, `rgba(${c.secondary}, 0.1)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.globalCompositeOperation = prevOp;
}

// ---- Grupo "sun" — raios de sol de um ponto fixo no topo, se intensificando
// na direção do cursor (nunca um círculo de luz — é um leque de linhas). ----
function drawSunRays(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number, c: Colors, time: number) {
  const cx = w * 0.5;
  const cy = h * 0.02;
  const rayCount = 32;
  const cursorAngle = Math.atan2(my - cy, mx - cx);
  const maxLen = Math.max(w, h);

  for (let i = 0; i < rayCount; i++) {
    const baseAngle = (i / rayCount) * Math.PI * 2 + time * 0.0009;
    let diff = baseAngle - cursorAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const boost = Math.max(0, 1 - Math.abs(diff) / 0.7);
    const len = maxLen * (0.42 + boost * 0.4);
    const x2 = cx + Math.cos(baseAngle) * len;
    const y2 = cy + Math.sin(baseAngle) * len;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${c.primary}, ${0.06 + boost * 0.16})`;
    ctx.lineWidth = 1 + boost * 2.4;
    ctx.stroke();
  }
}

// ---- Grupo "storm" — tema Tempestade: nuvens grandes e escuras derivando
// bem devagar (FORMAS GRANDES — se notam até numa captura de tela parada,
// ao contrário de pontinhos/linhas finas) + raios que cortam a tela
// periodicamente e clareiam tudo por uma fração de segundo. A tempestade
// "respira" sozinha (raio nasce sozinho de tempos em tempos); o cursor só
// puxa a origem do próximo raio pra perto dele. (Era a 3ª ideia pro tema
// Escuridão — o dono gostou tanto que virou tema próprio.) ----
interface Bolt { path: { x: number; y: number }[]; born: number; life: number }
let boltPool: Bolt[] = [];
let lastBoltAt = -9999;
let nextBoltGap = 60;

function zigzagBolt(x1: number, y1: number, x2: number, y2: number, depth: number): { x: number; y: number }[] {
  if (depth === 0) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = (Math.random() - 0.5) * len * 0.4;
  const nx = -dy / len;
  const ny = dx / len;
  const px = mx + nx * offset;
  const py = my + ny * offset;
  return [...zigzagBolt(x1, y1, px, py, depth - 1).slice(0, -1), ...zigzagBolt(px, py, x2, y2, depth - 1)];
}

function strokeBolt(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
}

const STORM_BLOBS = [
  { cx: 0.2, cy: 0.25, r: 0.55, speed: 0.0035, phase: 0 },
  { cx: 0.75, cy: 0.2, r: 0.45, speed: 0.0028, phase: 2.1 },
  { cx: 0.35, cy: 0.75, r: 0.5, speed: 0.004, phase: 4.4 },
  { cx: 0.85, cy: 0.7, r: 0.4, speed: 0.0022, phase: 1.3 },
];

function drawStorm(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, _my: number, c: Colors, time: number) {
  // Nuvens grandes e escuras — dão pra ver logo de cara, diferente de
  // detalhe fino que só aparece de perto.
  for (const b of STORM_BLOBS) {
    const x = w * (b.cx + Math.sin(time * b.speed + b.phase) * 0.08);
    const y = h * (b.cy + Math.cos(time * b.speed * 0.8 + b.phase) * 0.06);
    const r = Math.max(w, h) * b.r;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${c.secondary}, 0.22)`);
    grad.addColorStop(1, `rgba(${c.secondary}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Raio periódico — nasce sozinho (a tempestade "respira" mesmo parada);
  // se o cursor estiver na tela, puxa a origem pra perto dele.
  if (time - lastBoltAt > nextBoltGap) {
    const startX = mx > -1000 && Math.random() < 0.6 ? mx + (Math.random() - 0.5) * 100 : Math.random() * w;
    const endX = startX + (Math.random() - 0.5) * w * 0.35;
    const endY = h * (0.35 + Math.random() * 0.55);
    boltPool.push({ path: zigzagBolt(startX, -10, endX, endY, 5), born: time, life: 22 });
    lastBoltAt = time;
    nextBoltGap = 70 + Math.random() * 110;
  }

  for (let i = boltPool.length - 1; i >= 0; i--) {
    const bolt = boltPool[i];
    const age = time - bolt.born;
    if (age > bolt.life) { boltPool.splice(i, 1); continue; }
    const alpha = 1 - age / bolt.life;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${c.primary}, ${alpha * 0.9})`;
    strokeBolt(ctx, bolt.path);
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(${c.primary}, ${alpha * 0.18})`;
    strokeBolt(ctx, bolt.path);
    if (age < 4) {
      // Clarão rápido no instante em que o raio nasce.
      ctx.fillStyle = `rgba(${c.primary}, ${(1 - age / 4) * 0.06})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

// ---- Grupo "rain" — Escuridão, 6ª ideia ("Chuva"): ideia do próprio dono
// ("pensei em algo tipo uma chuva simples e quando eu passo o cursor do
// mouse eu jogo meio que a água de lado"). Chuva simples caindo; perto do
// cursor, cada gota ganha um EMPURRÃO lateral de verdade (velocidade
// horizontal, física de impulso + atrito) — a gota é literalmente jogada
// de lado, e a inclinação da gota desenhada mostra essa velocidade lateral
// somada à queda (como chuva batendo de vento). O empurrão passa sozinho
// (atrito) assim que o cursor se afasta, sem precisar resetar nada. ----
interface Drop { x: number; y: number; len: number; speed: number; vx: number }
let dropPool: Drop[] | null = null;

function ensureDrops(w: number, h: number): Drop[] {
  if (!dropPool) {
    dropPool = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 10 + Math.random() * 16,
      speed: 4 + Math.random() * 5,
      vx: 0,
    }));
  }
  return dropPool;
}

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number, c: Colors) {
  const drops = ensureDrops(w, h);
  const pushRadius = 130;

  for (const d of drops) {
    if (mx > -1000) {
      const dx = d.x - mx;
      const dy = d.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < pushRadius) {
        const push = (1 - dist / pushRadius) * 2.2;
        d.vx += (dx === 0 ? (Math.random() - 0.5) : Math.sign(dx)) * push;
      }
    }
    d.vx *= 0.94; // atrito — o empurrão passa sozinho quando o cursor se afasta
    d.x += d.vx;
    d.y += d.speed;

    if (d.x < -20) d.x = w + 20;
    else if (d.x > w + 20) d.x = -20;
    if (d.y - d.len > h) {
      d.y = -d.len;
      d.x = Math.random() * w;
      d.vx = 0;
    }

    const alpha = 0.18 + Math.min(1, d.speed / 9) * 0.35 + Math.min(1, Math.abs(d.vx) / 6) * 0.25;
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${c.primary}, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.moveTo(d.x - d.vx * 1.3, d.y - d.len);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
}

// ---- Grupo "matrix" — tema Hacker: chuva de caracteres caindo (clássico
// "Matrix"), rastro esmaecendo em vez de limpar o quadro inteiro a cada frame
// (por isso o próprio grupo cuida do fundo — ver drawFrame abaixo, que pula o
// clearRect só pra este grupo). Interatividade pedida pelo dono ("não sei
// como deixar o cursor interativo... mas faça"): caractere perto do mouse
// brilha branco (efeito "lanterna revelando o código") e a coluna acelera
// um pouco enquanto o cursor passa perto — sem precisar clicar em nada. ----
const MATRIX_CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
const MATRIX_FONT_SIZE = 16;

interface MatrixColumn {
  y: number;
  speed: number;
}
let matrixCols: MatrixColumn[] | null = null;
let matrixColCount = 0;

function ensureMatrixCols(w: number): MatrixColumn[] {
  const count = Math.max(1, Math.ceil(w / MATRIX_FONT_SIZE));
  if (!matrixCols || matrixColCount !== count) {
    matrixCols = Array.from({ length: count }, () => ({
      y: Math.random() * -40,
      speed: 0.3 + Math.random() * 0.7,
    }));
    matrixColCount = count;
  }
  return matrixCols;
}

function drawMatrix(ctx: CanvasRenderingContext2D, w: number, h: number, mx: number, my: number, c: Colors) {
  // Rastro: em vez de limpar tudo, pinta um preto quase transparente por
  // cima — o que já tinha desenhado vai apagando aos poucos, criando a
  // "cauda" de brilho atrás de cada caractere.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fillRect(0, 0, w, h);

  const cols = ensureMatrixCols(w);
  ctx.font = `${MATRIX_FONT_SIZE}px monospace`;
  ctx.textAlign = 'center';
  const cursorActive = mx > -1000;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const x = i * MATRIX_FONT_SIZE + MATRIX_FONT_SIZE / 2;
    const y = col.y * MATRIX_FONT_SIZE;
    const ch = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];

    const dx = x - mx;
    const dy = y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = cursorActive ? Math.max(0, 1 - dist / 130) : 0;

    ctx.fillStyle =
      near > 0.05
        ? `rgba(255, 255, 255, ${0.55 + near * 0.45})`
        : `rgba(${c.primary}, ${0.7 + Math.random() * 0.3})`;
    ctx.fillText(ch, x, y);

    // Coluna acelera perto do cursor, volta ao ritmo normal sozinha quando
    // o mouse se afasta — mesma ideia de "reage e relaxa" do grupo "rain".
    col.speed = near > 0.05 ? Math.min(1.8, col.speed + near * 0.08) : Math.max(0.3, col.speed - 0.01);
    col.y += col.speed;

    if (y > h + 40 && Math.random() > 0.975) {
      col.y = Math.random() * -20;
      col.speed = 0.3 + Math.random() * 0.7;
    }
  }
}

export function InteractiveBackground() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reduced-motion: mantém o PADRÃO visível (dono quer o fundo temático
    // sempre aparecendo — reportado várias vezes como "está tudo com uma cor
    // sólida"), só corta o que de fato é MOVIMENTO — sem loop de animação,
    // sem reagir ao cursor. Antes isso saía sem desenhar nada, que é
    // provavelmente a causa raiz do fundo aparecer 100% liso: se o SO/navegador
    // tem "reduzir movimento" ligado, o canvas nunca chegava a desenhar UM
    // frame sequer.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const group = groupForTheme(theme);
    let colors = readColors(canvas);
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let mouseX = -9999;
    let mouseY = -9999;
    let time = 0;
    let raf = 0;

    const drawFrame = () => {
      // "matrix" cuida do próprio fundo (rastro esmaecendo) — limpar aqui
      // apagaria o rastro inteiro a cada frame e o efeito nunca apareceria.
      if (group !== 'matrix') ctx.clearRect(0, 0, width, height);
      if (group === 'grid') drawGrid(ctx, width, height, mouseX, mouseY, colors, time);
      else if (group === 'waves') drawWaves(ctx, width, height, mouseX, mouseY, colors, time);
      else if (group === 'aurora') drawAurora(ctx, width, height, mouseX, mouseY, colors, time);
      else if (group === 'sun') drawSunRays(ctx, width, height, mouseX, mouseY, colors, time);
      else if (group === 'storm') drawStorm(ctx, width, height, mouseX, mouseY, colors, time);
      else if (group === 'matrix') drawMatrix(ctx, width, height, mouseX, mouseY, colors);
      else drawRain(ctx, width, height, mouseX, mouseY, colors);
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = readColors(canvas);
      if (reduceMotion) drawFrame();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    if (reduceMotion) {
      return () => ro.disconnect();
    }

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const handleLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseleave', handleLeave);

    const frame = () => {
      time += 1;
      drawFrame();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseleave', handleLeave);
      bubblePool = null;
      boltPool = [];
      lastBoltAt = -9999;
      nextBoltGap = 60;
      dropPool = null;
      matrixCols = null;
      matrixColCount = 0;
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />;
}
