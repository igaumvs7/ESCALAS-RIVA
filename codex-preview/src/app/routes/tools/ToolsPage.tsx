import { lazy, Suspense, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileArchive, FileOutput, FileStack, GraduationCap, ImageDown, Loader2, MessageCircle, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// Cada ferramenta é seu próprio pacote — quem só usa "Unir PDFs" não baixa
// as bibliotecas pesadas de conversão de Word/Excel (mammoth/xlsx/html2canvas),
// que só carregam quando a aba "Converter para PDF" é aberta.
const MergePdfTool = lazy(() => import('./sections/MergePdfTool').then((m) => ({ default: m.MergePdfTool })));
const CompressImagesTool = lazy(() =>
  import('./sections/CompressImagesTool').then((m) => ({ default: m.CompressImagesTool })),
);
const ConvertToPdfTool = lazy(() =>
  import('./sections/ConvertToPdfTool').then((m) => ({ default: m.ConvertToPdfTool })),
);
const WhatsAppLinkTool = lazy(() =>
  import('./sections/WhatsAppLinkTool').then((m) => ({ default: m.WhatsAppLinkTool })),
);
const CompressPdfTool = lazy(() =>
  import('./sections/CompressPdfTool').then((m) => ({ default: m.CompressPdfTool })),
);
const GanchosTool = lazy(() => import('./sections/GanchosTool').then((m) => ({ default: m.GanchosTool })));
const ProfessorRespostaTool = lazy(() =>
  import('./sections/ProfessorRespostaTool').then((m) => ({ default: m.ProfessorRespostaTool })),
);

type ToolId = 'merge' | 'compress' | 'compress-pdf' | 'convert' | 'whatsapp-link' | 'ganchos' | 'professor-resposta';

interface ToolDef {
  id: ToolId;
  label: string;
  desc: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
}

// Ferramentas de arquivo pro corretor no dia a dia. Todas rodam no navegador
// (sem custo de servidor, sem limite de upload nosso).
const TOOLS: ToolDef[] = [
  {
    id: 'merge',
    label: 'Unir PDFs',
    desc: 'Junte vários arquivos num só, na ordem que quiser',
    icon: FileStack,
    render: () => <MergePdfTool />,
  },
  {
    id: 'compress',
    label: 'Otimizar imagens',
    desc: 'Deixe fotos leves sem perder qualidade visível',
    icon: ImageDown,
    render: () => <CompressImagesTool />,
  },
  {
    id: 'compress-pdf',
    label: 'Otimizar PDF',
    desc: 'Reduza o tamanho de fichas e contratos escaneados',
    icon: FileArchive,
    render: () => <CompressPdfTool />,
  },
  {
    id: 'convert',
    label: 'Converter para PDF',
    desc: 'Transforme Word, Excel e imagens em PDF',
    icon: FileOutput,
    render: () => <ConvertToPdfTool />,
  },
  {
    id: 'whatsapp-link',
    label: 'WhatsApp e QR Code',
    desc: 'Gere um link direto ou QR Code pro seu número',
    icon: MessageCircle,
    render: () => <WhatsAppLinkTool />,
  },
  {
    id: 'ganchos',
    label: 'Ganchos',
    desc: 'Imagens prontas pra reengajar quem sumiu na conversa',
    icon: Sparkles,
    render: () => <GanchosTool />,
  },
  {
    id: 'professor-resposta',
    label: 'Professor Resposta',
    desc: 'Ajuda a escrever a mensagem certa pro cliente',
    icon: GraduationCap,
    render: () => <ProfessorRespostaTool />,
  },
];

function ToolFallback() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-secondary)]">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando ferramenta...
    </div>
  );
}

// Card da grade de ferramentas — pedido do dono: trocar a tira de abas
// (ficava apertada/quebrando no celular com só 5 itens) por uma grade de
// cards "mais elegante, premium, humanizada", inspirada nos cards de plano
// (PlanCard.tsx) que ele já aprovou. Mesma técnica: `useGSAP` + timeline
// pausada, tocada no mouseenter/leave — não `@keyframes` CSS novo (padrão
// do projeto, ver CLAUDE.md). O levantar do card em si (`hover:-translate-y`)
// é CSS simples de propósito (a própria skill do GSAP recomenda isso pro
// caso trivial) — só o ícone+glow, que têm mais de uma propriedade em jogo
// ao mesmo tempo, usam timeline.
function ToolCard({ tool, onOpen }: { tool: ToolDef; onOpen: () => void }) {
  const iconRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        tlRef.current = gsap
          .timeline({ paused: true, defaults: { ease: 'power2.out', duration: 0.35 } })
          .to(iconRef.current, { scale: 1.1, rotate: -6 }, 0)
          .to(glowRef.current, { autoAlpha: 1, scale: 1.15 }, 0)
          .to(arrowRef.current, { autoAlpha: 1, x: 0 }, 0);
        return () => tlRef.current?.kill();
      });
      return () => mm.revert();
    },
    { scope: cardRef },
  );

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onOpen}
      onMouseEnter={() => tlRef.current?.play()}
      onMouseLeave={() => tlRef.current?.reverse()}
      className="group relative flex flex-col gap-3.5 rounded-2xl border border-[rgba(var(--accent-secondary-rgb),0.16)] bg-gradient-to-br from-[rgba(var(--accent-secondary-rgb),0.07)] to-[rgba(var(--accent-secondary-rgb),0.015)] p-5 text-left backdrop-blur-xl transition-[transform,border-color,box-shadow] duration-300 ease-out will-change-transform hover:-translate-y-1 hover:border-[rgba(var(--accent-primary-rgb),0.5)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.35),0_0_28px_rgba(var(--accent-primary-rgb),0.1)]"
    >
      <div className="relative flex h-11 w-11 items-center justify-center rounded-[11px] border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)]">
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 rounded-[11px] opacity-0"
          style={{ background: 'radial-gradient(circle, rgba(var(--accent-primary-rgb),0.5), transparent 70%)' }}
          aria-hidden="true"
        />
        <div ref={iconRef} className="relative">
          <tool.icon className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
      </div>
      <div>
        <h3 className="text-[0.95rem] font-bold text-[var(--color-text-primary)]">{tool.label}</h3>
        <p className="mt-0.5 text-[0.78rem] leading-relaxed text-[var(--color-text-secondary)]">{tool.desc}</p>
      </div>
      <span
        ref={arrowRef}
        className="mt-auto flex items-center gap-1 text-[0.72rem] font-semibold text-[var(--accent-secondary)] opacity-0"
        style={{ transform: 'translateX(-4px)' }}
      >
        Abrir <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export default function ToolsPage() {
  const [active, setActive] = useState<ToolId | null>(null);
  const current = TOOLS.find((t) => t.id === active) ?? null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Ferramentas</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Utilitários de arquivo pro dia a dia — sem sair da plataforma
          </p>
        </div>
      </div>

      {current ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setActive(null)}
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--accent-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> Todas as ferramentas
          </button>
          <Suspense fallback={<ToolFallback />}>{current.render()}</Suspense>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onOpen={() => setActive(tool.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
