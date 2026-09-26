import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  Brain,
  ChevronDown,
  Copy,
  GraduationCap,
  Info,
  Loader2,
  MessageCircle,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSupabase } from '@/lib/supabase';

gsap.registerPlugin(useGSAP);

// Professor Resposta — pedido do dono (2026-09-09): ferramenta que reescreve
// a mensagem do usuário com técnica de venda real, mascote animado (o robô
// da marca), limite de 20 usos/dia por org. Ver
// BANCOS VIVAS CONNECT/IDEIAS-SOLTAS/README.md pro histórico da ideia e
// PROFESSOR-RESPOSTA-ESTUDO-DE-VENDAS.md pro estudo por trás do prompt.
//
// Mascote usa a imagem REAL da logo (public/logo-mark.png) em vez de
// recriar o desenho em SVG à mão. Coordenadas do capelo/óculos abaixo não
// são chute visual — foram medidas de verdade em cima do PNG real via
// varredura de pixel (PowerShell + System.Drawing, 2026-09-11): antena
// dourada centro (247,66) r≈26; olho esquerdo (142,180)-(216,234); olho
// direito (276,180)-(350,234); topo azul da cabeça plano entre x=160-330 na
// altura y≈63.
//
// Mãos: 5ª tentativa (2026-09-11), técnica nova e mais simples que as 4
// anteriores (CSS mask, clip-path com path customizado num <img> HTML,
// clip-path dentro de <svg><image>, animação por escala) — todas usavam
// coordenada ABSOLUTA (unidades do viewBox de 489), e cada uma vazou de um
// jeito diferente. Agora: `clip-path: inset(...)` com PORCENTAGEM no <img>
// — porcentagem é relativa à própria caixa renderizada, então não existe
// mais conversão de unidade nenhuma pra errar. Corta só uma faixa
// retangular embaixo (esconde queixo + as 2 mãos juntos, sem contorno
// complexo), redesenhados por cima como formas separadas. Mãos animam só
// por TRANSLAÇÃO Y (sem escala/rotação) — a folga de 15px é sempre maior
// que o deslocamento máximo usado (12px), então não tem conta de ângulo
// pra errar dessa vez, é só soma/subtração direta.
const GOLD = '#E8B94A';
const CAP_MATERIAL = '#1C1C2E';
const WHITE = '#FAFBFF';
const ROBOT_BLUE = '#055CFB';
const VISOR_BLACK = '#07090D';

interface ExemploTroca {
  nao_diga: string;
  diga: string;
  motivo: string;
}

interface Resultado {
  mensagem: string;
  porque: string[];
  exemplos: ExemploTroca[];
}

type MascotState = 'idle' | 'thinking' | 'sleeping';

const DAILY_LIMIT = 20;

// Os 3 passos e as 6 áreas ficam como dado, não como JSX solto no meio do
// arquivo — o painel embaixo só percorre essas listas.
const PASSOS = [
  {
    n: '01',
    titulo: 'Você escreve',
    desc: 'Do jeito que sair. Rascunho torto, ideia pela metade, texto sem vírgula. Não precisa caprichar.',
  },
  {
    n: '02',
    titulo: 'Ele reescreve',
    desc: 'Aplica técnica de venda de verdade em cima da SUA intenção. Não inventa oferta nem promete o que você não tem.',
  },
  {
    n: '03',
    titulo: 'Você aprende',
    desc: 'Vem o porquê de cada escolha e 5 trocas de "evite / prefira" do seu próprio assunto, pra treinar o olho.',
  },
];

const AREAS = [
  {
    icon: Target,
    titulo: 'Vendas e persuasão',
    fonte: 'Cialdini',
    desc: 'Os 6 princípios: reciprocidade, escassez real, autoridade, prova social, compromisso e afinidade. Aplicados só quando cabem, nunca forçados.',
  },
  {
    icon: Brain,
    titulo: 'Psicologia da decisão',
    fonte: 'Kahneman',
    desc: 'Aversão à perda e ancoragem. "Se esperar, perde a condição de hoje" pesa mais na cabeça do cliente do que "economize comprando agora".',
  },
  {
    icon: MessageCircle,
    titulo: 'Negociação e empatia tática',
    fonte: 'Chris Voss',
    desc: 'Rótulo emocional e pergunta calibrada (sempre aberta, nunca sim ou não), pra reengajar quem sumiu sem soar como cobrança.',
  },
  {
    icon: Zap,
    titulo: 'Gatilhos mentais',
    fonte: 'Uso com critério',
    desc: 'Os populares no marketing digital. A maioria é o próprio Cialdini com nome em português, então entram só onde existe base real por trás.',
  },
  {
    icon: Users,
    titulo: 'Vendas em massa',
    fonte: 'Dado de campo',
    desc: 'Tamanho ideal de mensagem e ritmo de follow-up, tirados de dado real de disparo em escala, não de achismo de guru.',
  },
  {
    icon: Activity,
    titulo: 'Neurociência da decisão',
    fonte: 'Damasio',
    desc: 'Mensagem puramente fria e factual converte pior do que uma que também comunica como aquela escolha faz a pessoa se sentir.',
  },
];

// Sessão do usuário expira depois de 1h (padrão Supabase); se a aba ficou
// aberta parada e o refresh automático em segundo plano não rodou a tempo
// (navegador pode pausar timer de aba inativa), a primeira chamada depois
// disso falha com 401 mesmo a pessoa estando logada de verdade — visto em
// produção 2026-09-11 (log confirmou: 200 às 13:33, 401 às 14:26, mesma
// sessão). Renova a sessão e tenta de novo 1x antes de desistir, em vez de
// só mostrar erro pra sessão que teria funcionado com um refresh.
async function invokeWithFreshSession(
  supabase: ReturnType<typeof getSupabase>,
  init: Parameters<ReturnType<typeof getSupabase>['functions']['invoke']>[1],
) {
  const first = await supabase.functions.invoke('professor-resposta', init);
  const status = (first.error as { context?: { status?: number } } | null)?.context?.status;
  if (first.error && status === 401) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) {
      return supabase.functions.invoke('professor-resposta', init);
    }
  }
  return first;
}

export function ProfessorRespostaTool() {
  const [rascunho, setRascunho] = useState('');
  const [contexto, setContexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [usosHoje, setUsosHoje] = useState<number | null>(null);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  // Resultado em abas e "sobre" recolhido: antes era tudo empilhado e a
  // página ficava gigante, precisava rolar até o fim pra ver tudo (pedido do
  // dono, 2026-09-11). Uma coisa por vez, sem perder nada.
  const [aba, setAba] = useState<'mensagem' | 'porque' | 'exemplos'>('mensagem');
  const [sobreAberto, setSobreAberto] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const thoughtRef = useRef<SVGGElement>(null);
  const dot1Ref = useRef<SVGCircleElement>(null);
  const dot2Ref = useRef<SVGCircleElement>(null);
  const dot3Ref = useRef<SVGGElement>(null);
  const zzz1Ref = useRef<SVGTextElement>(null);
  const zzz2Ref = useRef<SVGTextElement>(null);
  const eyesClosedRef = useRef<SVGGElement>(null);
  const leftHandRef = useRef<SVGPathElement>(null);
  const rightHandRef = useRef<SVGPathElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabase();
    invokeWithFreshSession(supabase, { method: 'GET' })
      .then(({ data }) => {
        if (data?.ok) {
          const usos = data.usosHoje as number;
          setUsosHoje(usos);
          // Bug real visto em produção (2026-09-10): se a pessoa já tinha
          // batido os 20 usos e só depois abre/recarrega a página, o
          // mascote continuava "acordado" — só dormia se o limite fosse
          // atingido NA HORA de uma pergunta. Agora checa isso já na
          // carga inicial também, não só no momento do erro.
          if (usos >= DAILY_LIMIT) setMascotState('sleeping');
        }
      })
      .catch(() => {
        /* contador é só decorativo, se falhar some sem quebrar a tela */
      });
  }, []);

  useGSAP(
    () => {
      gsap.killTweensOf([bodyRef.current, thoughtRef.current, eyesClosedRef.current, leftHandRef.current, rightHandRef.current]);
      gsap.set(bodyRef.current, { clearProps: 'transform,filter', transformOrigin: '50% 100%' });
      gsap.set(eyesClosedRef.current, { opacity: 0 });
      gsap.set([leftHandRef.current, rightHandRef.current], { y: 0 });

      // Piscada: reaproveita o MESMO overlay de "olhos fechados" que já existe
      // pro estado dormindo (é um desenho meu, nunca mexe na imagem — sem o
      // risco geométrico que a mão teve). Roda em parado e pensando, não em
      // dormindo (onde os olhos já ficam fechados o tempo todo). No pensando
      // pisca mais rápido/seguido — pedido do dono (2026-09-11): "movimento
      // com os olhos junto com a mão".
      const blinkDelay = mascotState === 'thinking' ? 1.3 : 3.4;
      let blinkTl: gsap.core.Timeline | null = null;
      if (mascotState !== 'sleeping' && eyesClosedRef.current) {
        blinkTl = gsap.timeline({ repeat: -1, repeatDelay: blinkDelay });
        blinkTl
          .to(eyesClosedRef.current, { opacity: 1, duration: 0.08, ease: 'power1.in' })
          .to(eyesClosedRef.current, { opacity: 0, duration: 0.12, ease: 'power1.out' }, '+=0.06');
      }

      if (mascotState === 'idle') {
        gsap.set(thoughtRef.current, { opacity: 0, scale: 0.6 });
        // parado: respiração lenta e sutil + mãos balançando bem de leve, só
        // pra não parecer uma foto morta — nada de rotação forte no corpo
        // aqui, isso fica só pro "pensando".
        const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } });
        tl.to(bodyRef.current, { y: -6, scale: 1.015, duration: 2.2 }, 0)
          .to(leftHandRef.current, { y: -3, duration: 2.2 }, 0)
          .to(rightHandRef.current, { y: -3, duration: 2.2 }, 0.2);
        return () => {
          tl.kill();
          blinkTl?.kill();
        };
      }

      if (mascotState === 'thinking') {
        gsap.set(thoughtRef.current, { transformOrigin: '70px 60px' });
        gsap.to(thoughtRef.current, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' });
        // pensando: POSE, não balanço. Oscilar o corpo de um lado pro outro
        // ficou parecendo "boneco em navio" (reclamação do dono, 2026-09-11).
        // Agora ele faz o gesto de quem está mesmo ponderando: inclina UMA
        // vez a cabeça e fica assim, a mão direita sobe até a altura do
        // queixo e dá batidinhas ritmadas ali, e por baixo só uma respiração
        // lenta. Movimento ordenado, com significado, em vez de vaivém.
        gsap.set(bodyRef.current, { transformOrigin: '50% 78%' });
        const poseTl = gsap.timeline();
        poseTl
          .to(bodyRef.current, { rotation: -5, duration: 0.5, ease: 'power2.out' }, 0)
          .to(rightHandRef.current, { y: -34, duration: 0.55, ease: 'power2.out' }, 0.1);
        // respiração por baixo da pose, pra não ficar congelado
        const floatTl = gsap.timeline({ repeat: -1, yoyo: true, delay: 0.55, defaults: { ease: 'sine.inOut' } });
        floatTl.to(bodyRef.current, { y: -4, duration: 1.5 }, 0).to(leftHandRef.current, { y: -3, duration: 1.5 }, 0);
        // batidinha da mão no queixo, o "tic" de quem está pensando
        const tapTl = gsap.timeline({ repeat: -1, yoyo: true, delay: 0.7, defaults: { ease: 'sine.inOut' } });
        tapTl.to(rightHandRef.current, { y: -43, duration: 0.42 });
        const dotsTl = gsap.timeline({ repeat: -1 });
        [dot1Ref.current, dot2Ref.current, dot3Ref.current].forEach((d, i) => {
          dotsTl.to(d, { opacity: 1, duration: 0.18 }, i * 0.15).to(d, { opacity: 0.35, duration: 0.18 }, i * 0.15 + 0.4);
        });
        return () => {
          poseTl.kill();
          floatTl.kill();
          tapTl.kill();
          dotsTl.kill();
          blinkTl?.kill();
        };
      }

      // dormindo: cabeça pesada caindo pro lado e ficando quase parada, mãos
      // descem um pouco (relaxadas), olhos fecham (troca as "cobrinhas"
      // brancas por uma linha, atrás do óculos, fica fechado até acabar esse
      // estado) e os Zzz sobem em loop.
      gsap.set(thoughtRef.current, { opacity: 0, scale: 0.6 });
      const dropTl = gsap.timeline();
      dropTl
        .to(bodyRef.current, {
          rotation: -16,
          y: 10,
          filter: 'grayscale(0.6) brightness(0.7)',
          duration: 0.6,
          ease: 'power2.out',
        })
        .to([leftHandRef.current, rightHandRef.current], { y: 5, duration: 0.5, ease: 'power2.out' }, 0)
        .to(eyesClosedRef.current, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0.15);
      const breatheTl = gsap.timeline({ repeat: -1, yoyo: true, delay: 0.6, defaults: { ease: 'sine.inOut' } });
      breatheTl.to(bodyRef.current, { y: '+=5', duration: 1.9 });

      let zzzTl: gsap.core.Timeline | null = null;
      if (zzz1Ref.current && zzz2Ref.current) {
        gsap.set([zzz1Ref.current, zzz2Ref.current], { opacity: 0, y: 0 });
        zzzTl = gsap
          .timeline({ repeat: -1 })
          .fromTo(zzz1Ref.current, { opacity: 0, y: 0 }, { opacity: 1, y: -16, duration: 0.9, ease: 'power1.out' }, 0)
          .to(zzz1Ref.current, { opacity: 0, y: -30, duration: 0.9, ease: 'power1.in' }, 0.9)
          .fromTo(
            zzz2Ref.current,
            { opacity: 0, y: 0 },
            { opacity: 1, y: -16, duration: 0.9, ease: 'power1.out' },
            0.6,
          )
          .to(zzz2Ref.current, { opacity: 0, y: -30, duration: 0.9, ease: 'power1.in' }, 1.5);
      }

      return () => {
        dropTl.kill();
        breatheTl.kill();
        zzzTl?.kill();
      };
    },
    { dependencies: [mascotState], scope: scopeRef },
  );

  const limiteAtingido = usosHoje !== null && usosHoje >= DAILY_LIMIT;

  const handleAsk = async () => {
    if (rascunho.trim().length < 3 || loading || limiteAtingido) return;
    setLoading(true);
    setMascotState('thinking');
    setResultado(null);
    try {
      const supabase = getSupabase();
      const startedAt = Date.now();
      const { data, error } = await invokeWithFreshSession(supabase, {
        body: { rascunho, contexto },
      });
      // Tempo mínimo fixo de "pensando", pedido do dono (2026-09-11): 3s dá
      // tempo de sobra pra animação (balanço de 0.55s por ciclo) completar
      // várias voltas de verdade antes de mostrar o resultado, mesmo quando
      // a IA responde bem mais rápido que isso.
      const MIN_THINKING_MS = 3000;
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_THINKING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_THINKING_MS - elapsed));
      }

      if (error || !data?.ok) {
        const status = (error as { context?: { status?: number } } | null)?.context?.status;
        // Bug real (2026-09-10): quando a Edge Function responde com status
        // de erro (429 aqui), o supabase-js zera "data" inteiro — então
        // checar "data?.error === 'limite_atingido'" nunca dava certo (data
        // é null), a tela simplesmente não fazia nada ao bater o limite ao
        // vivo. Status HTTP é o único sinal confiável nesse caso.
        if (status === 429 || data?.error === 'limite_atingido') {
          setUsosHoje(DAILY_LIMIT);
          setMascotState('sleeping');
          toast.info(
            data?.message ?? `Você já usou seus ${DAILY_LIMIT} conselhos de hoje. Volta amanhã bem cedo, combinado?`,
          );
        } else if (status === 401) {
          setMascotState('idle');
          toast.error('Sua sessão expirou', { description: 'Atualize a página e tente de novo.' });
        } else {
          setMascotState('idle');
          toast.error('Falha ao gerar resposta', { description: data?.error });
        }
        return;
      }

      setResultado(data.resultado as Resultado);
      setAba('mensagem');
      setUsosHoje(data.usosHoje as number);
      setMascotState('idle');
    } catch (err) {
      setMascotState('idle');
      toast.error('Falha ao gerar resposta', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = () => {
    if (!resultado) return;
    void navigator.clipboard.writeText(resultado.mensagem);
    toast.success('Copiado!');
  };

  return (
    <div className="space-y-4">
      <div ref={scopeRef} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card className="p-5 md:p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 block">
              O que você quer dizer pro cliente?
            </label>
            <textarea
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              rows={4}
              placeholder="Pode ser rascunho torto ou só a ideia solta..."
              disabled={loading || limiteAtingido}
              className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 block">
              Contexto da conversa (opcional)
            </label>
            <input
              type="text"
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              placeholder="Ex: cliente sumiu depois de ver o produto"
              disabled={loading || limiteAtingido}
              className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              onClick={() => void handleAsk()}
              disabled={loading || limiteAtingido || rascunho.trim().length < 3}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Perguntar ao Professor'}
            </Button>
            {usosHoje !== null && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                Usos hoje: <b className="text-[var(--color-text-label)]">{usosHoje} de {DAILY_LIMIT}</b>
              </span>
            )}
          </div>

        </Card>

        <div className="flex flex-col items-center text-center">
          <div className="relative w-56 pt-10">
            <div ref={bodyRef} className="relative">
              {/* clip-path com PORCENTAGEM (inset) — ver comentário no topo do
                  arquivo: as 4 tentativas anteriores usavam coordenada absoluta
                  do viewBox e vazavam; porcentagem é relativa à própria caixa
                  renderizada, não tem conversão pra errar. Esconde só a faixa de
                  baixo (queixo + as 2 mãos), redesenhada logo abaixo. */}
              <img
                src="/logo-mark.png"
                alt="Professor Resposta"
                className="w-full h-auto select-none"
                draggable={false}
                style={{ clipPath: 'inset(0 0 25% 0)' }}
              />

              {/* Queixo (estático) + as 2 mãos (animadas só por translação Y no
                  useGSAP acima), redesenhados na cor exata medida no PNG
                  (#055CFB corpo, preto do visor no queixo). */}
              <svg viewBox="0 0 489 418" className="absolute inset-0 w-full h-full pointer-events-none">
                <ellipse cx="238" cy="332" rx="52" ry="18" fill={VISOR_BLACK} />
                <path ref={leftHandRef} d="M61,399 L61,350 A75,35 0 0 1 211,350 L211,399 Z" fill={ROBOT_BLUE} />
                <path ref={rightHandRef} d="M265,399 L265,350 A75,35 0 0 1 415,350 L415,399 Z" fill={ROBOT_BLUE} />
              </svg>

              {/* capelo + óculos, sobrepostos à imagem real da logo, sem redesenhar o robô.
                  Coordenadas medidas de verdade em cima do PNG (2026-09-11, varredura de
                  pixel) — não são mais chute visual: olho esquerdo centro (179,207), olho
                  direito (313,207), cada um ~74x54; antena dourada centro (247,66) r≈26,
                  topo azul da cabeça plano entre x=160-330 na altura y≈63. Capelo
                  simplificado (só prancha + borla, sem base separada) e recentralizado —
                  a ponta de baixo encosta de leve no topo da antena em vez de flutuar
                  longe dela ou brigar por cima. */}
              <svg viewBox="0 0 489 418" className="absolute inset-0 w-full h-full pointer-events-none">
                <g>
                  <polygon
                    points="245,6 348,20 245,42 142,20"
                    fill={CAP_MATERIAL}
                    stroke={GOLD}
                    strokeWidth={3}
                    strokeLinejoin="round"
                  />
                  <circle cx="245" cy="23" r="5" fill={GOLD} />
                  <path d="M245,23 Q292,50 316,96" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
                  <path d="M316,96 L307,106 M316,96 L320,109 M316,96 L328,100" stroke={GOLD} strokeWidth={2.5} strokeLinecap="round" />
                </g>
                <g opacity={0.95}>
                  <circle cx="179" cy="207" r="42" fill="none" stroke={GOLD} strokeWidth={5} />
                  <circle cx="313" cy="207" r="42" fill="none" stroke={GOLD} strokeWidth={5} />
                  <path d="M221,204 Q247,192 271,204" fill="none" stroke={GOLD} strokeWidth={5} />
                  <line x1="137" y1="204" x2="98" y2="196" stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
                  <line x1="355" y1="204" x2="394" y2="196" stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
                </g>
                {/* olhos fechados: entra por cima dos olhos originais (fundo cor do
                    visor, tampando a forma branca) + uma linha só, controlado por
                    opacidade via GSAP — só aparece de verdade no estado "dormindo". */}
                <g ref={eyesClosedRef}>
                  <ellipse cx="179" cy="207" rx="38" ry="28" fill={VISOR_BLACK} />
                  <ellipse cx="313" cy="207" rx="38" ry="28" fill={VISOR_BLACK} />
                  <path d="M150,208 Q179,219 208,208" fill="none" stroke={GOLD} strokeWidth={3.5} strokeLinecap="round" />
                  <path d="M284,208 Q313,219 342,208" fill="none" stroke={GOLD} strokeWidth={3.5} strokeLinecap="round" />
                </g>
              </svg>

              {/* zzz, só no estado "dormindo" — sobem e somem em loop (ver useGSAP) */}
              {mascotState === 'sleeping' && (
                <svg viewBox="0 0 489 418" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                  <text ref={zzz1Ref} x="60" y="90" fontSize={30} fontWeight={800} fill={GOLD}>Z</text>
                  <text ref={zzz2Ref} x="38" y="60" fontSize={22} fontWeight={800} fill={GOLD} opacity={0.8}>z</text>
                </svg>
              )}
            </div>

            {/* balão de pensamento: fica inteiramente ACIMA do personagem (nunca
                sobreposto/atrás da caixa de texto ao lado), só no estado "pensando". */}
            <svg
              viewBox="0 0 200 200"
              className="absolute -left-6 -top-8 w-24 h-24 pointer-events-none z-20 overflow-visible"
            >
              <g ref={thoughtRef} style={{ opacity: 0 }}>
                <g ref={dot3Ref}>
                  <ellipse cx="70" cy="55" rx="44" ry="30" fill={WHITE} />
                  <circle cx="56" cy="55" r="5" fill={GOLD} />
                  <circle cx="70" cy="55" r="5" fill={GOLD} />
                  <circle cx="84" cy="55" r="5" fill={GOLD} />
                </g>
                <circle ref={dot2Ref} cx="112" cy="92" r="10" fill={WHITE} opacity={0.35} />
                <circle ref={dot1Ref} cx="128" cy="114" r="6" fill={WHITE} opacity={0.35} />
              </g>
            </svg>
          </div>

          <div className="mt-4 w-full rounded-xl border border-[rgba(var(--accent-primary-rgb),0.22)] bg-black/20 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-text-primary)]">
            {mascotState === 'sleeping'
              ? `Usei meus ${DAILY_LIMIT} conselhos de hoje. Volto amanhã bem cedo, combinado?`
              : mascotState === 'thinking'
                ? 'Analisando sua mensagem, só um instante...'
                : 'Pronto pra te ajudar a escrever a mensagem certa.'}
          </div>
        </div>
      </div>

      {resultado && (
        <Card className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(var(--accent-secondary-rgb),0.12)] pb-4">
            <div className="flex flex-wrap gap-2 rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.14)] bg-black/25 p-1.5">
              {(
                [
                  { id: 'mensagem', label: 'Mensagem pronta' },
                  { id: 'porque', label: `Por que ficou melhor (${resultado.porque?.length ?? 0})` },
                  { id: 'exemplos', label: `Evite / prefira (${resultado.exemplos?.length ?? 0})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAba(t.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${
                    aba === t.id
                      ? 'border-[rgba(var(--accent-primary-rgb),0.5)] bg-[rgba(var(--accent-primary-rgb),0.16)] text-[var(--accent-primary)] shadow-[0_0_18px_rgba(var(--accent-primary-rgb),0.12)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copyMessage}
              className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--accent-primary-rgb),0.35)] bg-[rgba(var(--accent-primary-rgb),0.1)] px-4 py-2.5 text-xs font-bold text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-primary-rgb),0.18)]"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar mensagem
            </button>
          </div>

          <div className="pt-5">
            {aba === 'mensagem' && (
              <div className="rounded-xl border border-[rgba(var(--accent-primary-rgb),0.28)] bg-[rgba(var(--accent-primary-rgb),0.06)] p-5 text-[0.98rem] leading-[1.75] text-[var(--color-text-primary)] whitespace-pre-line">
                {resultado.mensagem}
              </div>
            )}

            {aba === 'porque' && (
              <ol className="space-y-2.5">
                {resultado.porque.map((p, i) => (
                  <li
                    key={i}
                    className="flex gap-3.5 rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] px-4 py-3.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--accent-primary-rgb),0.16)] text-xs font-extrabold text-[var(--accent-primary)]">
                      {i + 1}
                    </span>
                    <span className="text-[0.92rem] leading-relaxed text-[var(--color-text-primary)]">{p}</span>
                  </li>
                ))}
              </ol>
            )}

            {aba === 'exemplos' && (
              <div className="space-y-3">
                <p className="text-[0.82rem] text-[var(--color-text-secondary)]">
                  Trocas do seu próprio assunto, pra usar em qualquer conversa parecida.
                </p>
                {resultado.exemplos?.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02] p-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3.5 py-2.5">
                        <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-red-400/90">
                          Evite
                        </div>
                        <div className="mt-1.5 text-[0.92rem] leading-relaxed text-[var(--color-text-secondary)]">
                          {ex.nao_diga}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.08)] px-3.5 py-2.5">
                        <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[var(--color-success)]">
                          Prefira
                        </div>
                        <div className="mt-1.5 text-[0.92rem] font-medium leading-relaxed text-[var(--color-text-primary)]">
                          {ex.diga}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[0.82rem] leading-relaxed text-[var(--color-text-secondary)]">
                      <span className="font-bold text-[var(--color-text-label)]">Por quê: </span>
                      {ex.motivo}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setSobreAberto((v) => !v)}
          className="flex w-full items-center gap-4 p-5 text-left"
        >
          <div className="h-10 w-10 shrink-0 rounded-xl border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)] flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-[var(--accent-primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--color-text-primary)]">
              Como funciona e no que ele foi treinado
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Cialdini, Kahneman, Chris Voss, Damasio e mais. Toque pra ver o método completo.
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-300 ${
              sobreAberto ? 'rotate-180' : ''
            }`}
          />
        </button>

        {sobreAberto && (
          <div className="space-y-8 border-t border-[rgba(var(--accent-secondary-rgb),0.12)] p-5 md:p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)] items-center justify-center">
            <GraduationCap className="h-5 w-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="text-label">Sobre a ferramenta</div>
            <h2 className="text-xl font-bold text-display text-[var(--color-text-primary)]">Professor Resposta</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-text-secondary)] max-w-[68ch]">
              Um mentor de vendas dentro da plataforma. Ele não escreve por você nem inventa
              oferta: pega o que você já quis dizer e devolve a mesma intenção escrita do jeito
              que dá mais resposta, sempre mostrando o raciocínio por trás de cada escolha.
              A ideia é que, depois de algumas vezes, você não precise mais dele pra escrever
              bem.
            </p>
          </div>
        </div>

        <div>
          <div className="text-label mb-3">Como funciona</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PASSOS.map((passo) => (
              <div
                key={passo.n}
                className="rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.16)] bg-gradient-to-br from-[rgba(var(--accent-secondary-rgb),0.07)] to-transparent p-4"
              >
                <div className="text-[0.7rem] font-extrabold tracking-[0.2em] text-[var(--accent-primary)]">
                  {passo.n}
                </div>
                <div className="mt-1.5 text-sm font-bold text-[var(--color-text-primary)]">{passo.titulo}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">{passo.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-label mb-1">Em que ele foi treinado</div>
          <p className="mb-3.5 text-xs text-[var(--color-text-secondary)]">
            Seis campos, cada um com fonte real por trás. Nada de fórmula mágica de internet.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {AREAS.map((area) => (
              <div
                key={area.titulo}
                className="flex gap-3.5 rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.14)] bg-white/[0.02] p-4"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg border border-[rgba(var(--accent-primary-rgb),0.25)] bg-[rgba(var(--accent-primary-rgb),0.08)] flex items-center justify-center">
                  <area.icon className="h-4 w-4 text-[var(--accent-primary)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold text-[var(--color-text-primary)]">{area.titulo}</span>
                    <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--accent-secondary)]">
                      {area.fonte}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">{area.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 rounded-xl border border-[rgba(var(--accent-primary-rgb),0.18)] bg-[rgba(var(--accent-primary-rgb),0.05)] p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
            <span className="font-bold text-[var(--color-text-label)]">O que ele não faz.</span> Psicanálise
            entra só como pano de fundo do campo, nunca como técnica de reescrita. E ele nunca
            justifica uma sugestão com jargão tipo "isso libera oxitocina": essa alegação popular
            de marketing tem base científica bem contestada. Aqui a explicação é simples e
            defensável, ou não entra.
          </p>
        </div>
          </div>
        )}
      </Card>
    </div>
  );
}
