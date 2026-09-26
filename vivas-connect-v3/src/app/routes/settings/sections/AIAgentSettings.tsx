import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  Download,
  FileText,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Home,
  Loader2,
  MessageCircle,
  Plus,
  Scale,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

// System prompt padrão — reescrito por completo (pedido do dono: "as
// variáveis estavam esquisitas e confusas", "deixe o agente com o melhor
// atendimento de todos, sempre qualificando o lead", "já praticamente
// pronto pro cliente usar"). Antes o prompt padrão nem usava as variáveis
// que a tela oferecia — cliente novo via um monte de {variavel} disponível
// sem nenhum exemplo de uso real. Agora o prompt em si é o exemplo: chega
// pronto pra funcionar em QUALQUER profissão (usa {segmento}, não
// "imóveis" fixo), já com lógica de qualificação de lead e de handoff.
const DEFAULT_PROMPT = `Você é {nome_do_agente}, atendente virtual da {nome_da_empresa} ({segmento}), falando pelo WhatsApp em português do Brasil. Tom caloroso, direto e profissional — nunca robótico, nunca genérico.

O QUE A {nome_da_empresa} OFERECE
{produtos_servicos}

SEU OBJETIVO EM TODA CONVERSA
1. Entender rápido o que a pessoa procura — pergunte, não presuma.
2. Qualificar o lead: descubra a necessidade real, o nível de urgência/interesse e, quando fizer sentido, orçamento ou preferências. Uma pergunta de cada vez, sem parecer interrogatório.
3. Apresentar a solução certa, usando a base de conhecimento e o que você sabe dos produtos/serviços.
4. Sempre termine com uma pergunta ou próximo passo claro — nunca deixe a conversa "morrer" sem direção.

COMO SE COMPORTAR
- Mensagens curtas, como alguém digitando de verdade no WhatsApp — nunca parágrafos longos.
- Use o nome da pessoa quando souber: {nome_do_contato}.
- Se tiver mídia relevante pra mostrar (foto, catálogo, vídeo), use [MEDIA:rotulo] — mídias disponíveis: {midias_disponiveis}.
- Se não tiver certeza de algo, seja honesto e ofereça transferir para um humano — nunca invente informação.

QUANDO TRANSFERIR PARA UM HUMANO
Escreva [HANDOFF] sozinho numa linha quando:
- A pessoa pedir explicitamente para falar com alguém.
- O lead estiver pronto para fechar/comprar e precisar de alguém pra finalizar.
- A pergunta fugir do que você sabe responder com segurança.

HORÁRIO DE ATENDIMENTO
Agora: {agora}. Dentro do horário: {dentro_do_horario}. Horário de atendimento: {horario_atendimento}.
Se estiver fora do horário, avise com: {mensagem_fora_horario}

Nunca se apresente como "um robô" ou "uma IA", a não ser que perguntem diretamente — você é {nome_do_agente}, da equipe da {nome_da_empresa}.`;

// Modelos GPT disponíveis pra escolha — só 2, decisão do dono (2026-08-28):
// 'gpt-4o-mini' é o padrão (mais barato dos dois, qualidade já boa pra
// atender cliente); 'gpt-4.1-mini' fica como "upgrade" de qualidade pra quem
// achar a resposta rasa (~5x mais caro por mensagem, ainda assim irrelevante
// em R$ no volume atual). 'gpt-4.1-nano' saiu da lista (qualidade pior pra
// conversar com cliente, sem ficar mais barato o suficiente pra compensar).
// 'gpt-4.1'/'gpt-4o' (cheios) nunca entraram — custam bem mais por mensagem.
// O backend (process-ai-message) também clampa pro mesmo teto por segurança,
// mesmo que essa lista mude de novo no futuro.
const GPT_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];

// Nome exibido pro cliente (2026-08-29, pedido do dono: "ninguém ficar
// sabendo qual [IA] utilizamos") — o valor real salvo no banco/enviado pra
// API continua sendo o id técnico (gpt-4o-mini/gpt-4.1-mini), só a LABEL na
// tela troca. Nunca expor o nome do provedor (OpenAI) nem o id técnico aqui.
const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'Vivas IA Standard',
  'gpt-4.1-mini': 'Vivas IA Pro',
};

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Bahia',
];

// Modelo de perguntas pra ajudar QUALQUER cliente (não só corretor — o SaaS
// atende públicos variados) a montar a Base de Conhecimento. 2026-08-29:
// virou um arquivo POR SEGMENTO (pedido do dono: "teríamos vários arquivos
// de vários segmentos... organize numa seleção do txt que ele quer baixar")
// em vez de um arquivo único gigante com todos os blocos juntos — a pessoa
// escolhe o segmento dela na tela e baixa só o arquivo montado pra ela,
// sem precisar vasculhar nem apagar bloco de segmento alheio.
const BASE_FILE_INTRO = `BASE DE CONHECIMENTO — MODELO PARA O AGENTE DE IA
====================================================

LEIA ANTES DE COMEÇAR — ISSO É IMPORTANTE
------------------------------------------
- A IA vai seguir EXATAMENTE o que você escrever aqui. Se tiver um erro
  de português, uma frase mal escrita ou uma informação errada, ela vai
  repetir esse erro pros seus clientes de verdade — não existe "a IA vai
  entender o que eu quis dizer", ela responde com base no que está
  escrito, não no que você pensou.
- Escreva com calma, revise antes de subir o arquivo. Peça pra alguém
  ler também, se puder.
- Quanto MAIS completo e detalhado, melhor. Informação faltando vira a
  IA respondendo de forma genérica, "não sei" pro cliente, ou pior:
  inventando uma resposta errada. Não existe "informação demais" aqui —
  só existe informação faltando. 15 minutos preenchendo com cuidado
  agora evita retrabalho e dor de cabeça depois.


COMO USAR
------------------------------------------
1. Preencha a SEÇÃO 1 inteira.
2. Preencha a SEÇÃO 2 — já veio pronta com as perguntas do seu segmento.
3. Preencha a SEÇÃO 3 — não é sobre o que a IA sabe, é sobre COMO ela
   deve agir.
4. Salve o arquivo e suba ele em Agente de IA > Base de conhecimento.
`;

const BASE_SECTION_1 = `
====================================================
SEÇÃO 1 — SOBRE VOCÊ
====================================================

1.1 Identidade
- Nome da empresa/marca:
- Nome com o qual a IA deve se apresentar (se for diferente do seu nome):
- Cidade(s)/região/bairros que você atende:
- Há quanto tempo você está nesse mercado:
- Site ou rede social oficial, se tiver:

1.2 O que você faz
- Descreva em poucas frases o que você oferece:
- Qual seu principal diferencial? (por que escolher você, não o concorrente)
- Algo que você NÃO faz/não vende, pra IA nunca sugerir por engano?

1.3 Atendimento e pagamento
- Horário de atendimento humano (dias e horas):
- Fora desse horário, o que a IA deve dizer ao cliente?
- Formas de pagamento aceitas (se for o caso):
- Fluxo normal: o cliente fecha tudo pelo WhatsApp, ou precisa ligar,
  ir até um local, agendar visita?

1.4 As 5 perguntas que seus clientes mais fazem
- Liste as perguntas reais mais comuns e a resposta certa pra cada uma:
  1)
  2)
  3)
  4)
  5)
`;

const BASE_SECTION_3 = `
====================================================
SEÇÃO 3 — MODO DE OPERAÇÃO: COMO VOCÊ QUER QUE A IA AJA
====================================================
Isso é diferente da Seção 1 e 2 (o que ela SABE) — aqui é o COMO ela AGE.

- Tom de voz: formal, descontraído, direto, caloroso? Dê um exemplo de
  como você mesmo falaria com um cliente novo:
- A IA pode negociar preço/condição sozinha, ou deve sempre confirmar
  com você antes de qualquer coisa fora do padrão?
- Em que momento exato ela deve te chamar (transferir a conversa) em
  vez de tentar responder? (ex.: cliente pede humano, cliente pronto
  pra fechar, pergunta fora do que ela sabe, reclamação, cliente
  alterado)
- Existe alguma palavra, promessa ou frase que ela NUNCA pode usar?
- Se o cliente for grosseiro, insistir num "não", ou ficar impaciente,
  o que ela deve fazer?
- Algo específico do seu jeito de atender que faz diferença, e que você
  quer que a IA imite?
`;

interface SegmentDef {
  id: string;
  label: string;
  icon: LucideIcon;
  questions: string;
}

const SEGMENTS: SegmentDef[] = [
  {
    id: 'corretor',
    label: 'Corretor de Imóveis',
    icon: Home,
    questions: `- Venda, aluguel, ou os dois?
- Residencial, comercial, ou ambos?
- Especialista em algo (lançamento, alto padrão, popular, terreno, praia)?
- Onde o cliente vê a lista de imóveis disponíveis?
- Como funciona o processo até a assinatura?
- Documentos exigidos do comprador/inquilino?
- Trabalha com financiamento? Com quais bancos?
- Exige fiador, seguro-fiança ou caução no aluguel? Quais opções?
- Valor médio da taxa de administração (aluguel)?
- Cobra alguma taxa do comprador/locatário?
- Dá pra negociar o valor do imóvel?`,
  },
  {
    id: 'saude',
    label: 'Saúde / Clínica / Consultório',
    icon: HeartPulse,
    questions: `- Quais especialidades ou procedimentos você oferece?
- Atende convênio? Quais?
- Como funciona marcar consulta (precisa de exame prévio, encaminhamento)?
- Valor da consulta particular, se puder informar:
- Algum preparo que o paciente precisa saber antes da consulta/exame?
- Emite recibo/nota fiscal pra reembolso de convênio?`,
  },
  {
    id: 'advocacia',
    label: 'Advocacia / Serviços Jurídicos',
    icon: Scale,
    questions: `- Quais áreas do direito você atende?
- A primeira consulta tem custo ou é gratuita?
- Como funciona a cobrança (valor fixo, % de êxito, por hora)?
- O que a IA NUNCA deve responder como se fosse "orientação jurídica" —
  e deve sempre te encaminhar em vez de arriscar?`,
  },
  {
    id: 'loja',
    label: 'Loja / E-commerce / Venda de Produto',
    icon: ShoppingBag,
    questions: `- O que você vende (categorias principais)?
- Loja física, só online, ou os dois?
- Prazo e valor de entrega/frete?
- Política de troca e devolução?
- Formas de pagamento e parcelamento?
- Como o cliente acompanha o pedido depois de comprar?`,
  },
  {
    id: 'educacao',
    label: 'Educação / Cursos / Mentorias',
    icon: GraduationCap,
    questions: `- Quais cursos ou formações você oferece?
- Formato: online, presencial, gravado, ao vivo?
- Duração e carga horária?
- Valor e formas de pagamento?
- Emite certificado?
- Turma com vaga limitada ou entrada contínua?`,
  },
  {
    id: 'alimentacao',
    label: 'Alimentação / Restaurante / Delivery',
    icon: UtensilsCrossed,
    questions: `- Cardápio principal (pratos/categorias mais pedidos)?
- Faz entrega? Qual a área e o valor da taxa?
- Horário de funcionamento?
- Aceita reserva? Como funciona?
- Formas de pagamento?`,
  },
  {
    id: 'servicos',
    label: 'Serviços em Geral / Prestador Autônomo',
    icon: Wrench,
    questions: `- Quais serviços você presta?
- Como funciona o orçamento (é gratuito, precisa de visita técnica)?
- Prazo médio de execução?
- Você dá garantia do serviço? Por quanto tempo?
- Atende em domicílio, o cliente leva até você, ou os dois?`,
  },
  {
    id: 'outro',
    label: 'Outro segmento (não está na lista)',
    icon: HelpCircle,
    questions: `- Descreva com o máximo de detalhe possível: o que você faz, como
  funciona a compra/contratação, prazos, preços (se puder informar),
  garantias, e as dúvidas mais comuns dos seus clientes.`,
  },
];

function buildSegmentFile(segment: SegmentDef): string {
  const section2 = `
====================================================
SEÇÃO 2 — ${segment.label.toUpperCase()}
====================================================
${segment.questions}
`;
  return BASE_FILE_INTRO + BASE_SECTION_1 + section2 + BASE_SECTION_3;
}

function downloadBaseFile(segment: SegmentDef) {
  const content = buildSegmentFile(segment);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `base-de-conhecimento-${segment.id}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Mesmo tratamento de hover dos cards de Ferramentas (pedido do dono, depois
// de aprovar aquela grade: "coloque essa animação em outras coisas do
// sistema") — ícone escala/gira e ganha um glow, card levanta um pouco.
function SegmentCard({ segment, onDownload }: { segment: SegmentDef; onDownload: () => void }) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        tlRef.current = gsap
          .timeline({ paused: true, defaults: { ease: 'power2.out', duration: 0.3 } })
          .to(iconRef.current, { scale: 1.12, rotate: -6 }, 0)
          .to(glowRef.current, { autoAlpha: 1, scale: 1.2 }, 0);
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
      onClick={onDownload}
      onMouseEnter={() => tlRef.current?.play()}
      onMouseLeave={() => tlRef.current?.reverse()}
      className="flex items-center gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.03] px-3.5 py-3 text-left transition-[transform,border-color] duration-300 ease-out will-change-transform hover:-translate-y-0.5 hover:border-[rgba(var(--accent-primary-rgb),0.5)]"
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.1)]">
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0"
          style={{ background: 'radial-gradient(circle, rgba(var(--accent-primary-rgb),0.5), transparent 70%)' }}
          aria-hidden="true"
        />
        <div ref={iconRef} className="relative">
          <segment.icon className="h-4 w-4 text-[var(--accent-primary)]" />
        </div>
      </div>
      <span className="min-w-0 flex-1 text-sm text-[var(--color-text-primary)]">{segment.label}</span>
      <Download className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
    </button>
  );
}

// Placeholder genérico (usado só como formato-base do toRows abaixo — quase
// nunca aparece assim na tela, ver buildDefaultVariables).
const DEFAULT_VARIABLES: Record<string, string> = {
  nome_do_agente: 'Sofia',
  nome_da_empresa: '',
  segmento: '',
  produtos_servicos: '',
};

// Org nova (sem linha em ai_agent_config ainda) já entra com nome do
// negócio e profissão PREENCHIDOS a partir do que a pessoa já informou no
// cadastro/Vivas Perfil — antes vinha hardcoded "VIVAS" (nossa marca, não a
// do cliente) e "Imóveis" (só fazia sentido pra corretor). "produtos_servicos"
// fica em branco de propósito: só o próprio cliente sabe o que vende.
function buildDefaultVariables(orgName: string | null, profession: string | null): Record<string, string> {
  return {
    nome_do_agente: 'Sofia',
    nome_da_empresa: orgName ?? '',
    segmento: profession ?? '',
    produtos_servicos: '',
  };
}

// Placeholder de exemplo por variável conhecida — só cosmético, ajuda a
// entender o que preencher em cada uma (pedido do dono: variáveis
// "esquisitas e confusas").
const VAR_PLACEHOLDER: Record<string, string> = {
  nome_do_agente: 'Ex: Sofia',
  nome_da_empresa: 'Ex: Imobiliária Sol Nascente',
  segmento: 'Ex: Corretora de Imóveis',
  produtos_servicos: 'Ex: Apartamentos e casas à venda e para alugar na Zona Sul',
};

// Variáveis preenchidas automaticamente em runtime (process-ai-message).
// Aparecem no autocomplete mas não são editáveis aqui.
const AUTO_VARS = [
  'nome_do_contato',
  'agora',
  'dentro_do_horario',
  'horario_atendimento',
  'mensagem_fora_horario',
  'midias_disponiveis',
];

type VarRow = { key: string; value: string };

function toRows(obj: Record<string, string> | null | undefined): VarRow[] {
  const src = obj && Object.keys(obj).length ? obj : DEFAULT_VARIABLES;
  return Object.entries(src).map(([key, value]) => ({ key, value: String(value ?? '') }));
}

export function AIAgentSettings() {
  const { userId, orgName, profession } = useAppUser();
  // Lidas dentro do .then() assíncrono abaixo sem virar dependência do
  // efeito — pega o valor mais recente de orgName/profession no momento em
  // que a config carrega, sem arriscar re-rodar o efeito (e resetar edição
  // em andamento) só porque esses dois terminaram de carregar um instante
  // depois do userId.
  const orgNameRef = useRef(orgName);
  orgNameRef.current = orgName;
  const professionRef = useRef(profession);
  professionRef.current = profession;
  const [rowId, setRowId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(800);
  const [activeWhatsapp, setActiveWhatsapp] = useState(true);
  const [model, setModel] = useState('gpt-4o-mini');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [variables, setVariables] = useState<VarRow[]>(toRows(DEFAULT_VARIABLES));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [baseFileOpen, setBaseFileOpen] = useState(false);

  // Autocomplete de variáveis ao digitar "{" no prompt.
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [varMenu, setVarMenu] = useState<{ partial: string; pos: number } | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    supabase
      .from('ai_agent_config')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRowId(data.id as string);
          setSystemPrompt((data.system_prompt as string) ?? DEFAULT_PROMPT);
          setTemperature(Number(data.temperature ?? 0.7));
          setMaxTokens(Math.min(Number(data.max_tokens ?? 1000), 800));
          setActiveWhatsapp(Boolean(data.active_whatsapp ?? true));
          const loadedModel = (data.model as string) ?? 'gpt-4o-mini';
          setModel(GPT_MODELS.includes(loadedModel) ? loadedModel : 'gpt-4o-mini');
          const loadedTz = (data.timezone as string) ?? 'America/Sao_Paulo';
          setTimezone(TIMEZONES.includes(loadedTz) ? loadedTz : 'America/Sao_Paulo');
          setVariables(toRows(data.variables as Record<string, string> | null));
        } else {
          // Org nova — já entrega pronto com nome do negócio/profissão reais
          // em vez de placeholder da nossa marca (ver buildDefaultVariables).
          setVariables(toRows(buildDefaultVariables(orgNameRef.current, professionRef.current)));
        }
        setLoading(false);
      });
  }, [userId]);

  const varKeys = useMemo(
    () => [...variables.map((v) => v.key.trim()).filter(Boolean), ...AUTO_VARS],
    [variables],
  );

  const menuMatches = useMemo(() => {
    if (!varMenu) return [];
    const p = varMenu.partial.toLowerCase();
    return varKeys.filter((k) => k.toLowerCase().startsWith(p)).slice(0, 8);
  }, [varMenu, varKeys]);

  const onPromptChange = (value: string) => {
    setSystemPrompt(value);
    const caret = promptRef.current?.selectionStart ?? value.length;
    // Texto entre o último "{" e o cursor, sem "}" no meio → abre o menu.
    const before = value.slice(0, caret);
    const match = before.match(/\{([a-z0-9_]*)$/i);
    if (match) setVarMenu({ partial: match[1], pos: caret - match[1].length });
    else setVarMenu(null);
  };

  const insertVariable = (key: string) => {
    if (!varMenu) return;
    const start = varMenu.pos;
    const caret = promptRef.current?.selectionStart ?? systemPrompt.length;
    const next = systemPrompt.slice(0, start) + key + '}' + systemPrompt.slice(caret);
    setSystemPrompt(next);
    setVarMenu(null);
    // Reposiciona o cursor após o "}".
    const newCaret = start + key.length + 1;
    requestAnimationFrame(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(newCaret, newCaret);
    });
  };

  const setVar = (i: number, patch: Partial<VarRow>) =>
    setVariables((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addVar = () => setVariables((prev) => [...prev, { key: '', value: '' }]);
  const removeVar = (i: number) => setVariables((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    // Normaliza variáveis: chaves a-z0-9_ , descarta linhas sem chave.
    const varsObj: Record<string, string> = {};
    for (const { key, value } of variables) {
      const k = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (k) varsObj[k] = value;
    }
    setSaving(true);
    const supabase = getSupabase();
    const payload = {
      system_prompt: systemPrompt,
      temperature,
      max_tokens: maxTokens,
      // Sempre ativo globalmente; quem liga/desliga a IA são os toggles por canal.
      is_active: true,
      active_whatsapp: activeWhatsapp,
      model,
      timezone,
      variables: varsObj,
    };
    const { error } = rowId
      ? await supabase.from('ai_agent_config').update(payload).eq('id', rowId)
      : await supabase.from('ai_agent_config').insert(payload);
    if (error) {
      setSaving(false);
      toast.error('Falha ao salvar', { description: error.message });
      return;
    }

    setSaving(false);
    toast.success('Configuração do agente salva.');
  };

  if (loading) {
    return (
      <Card>
        <div className="text-label opacity-60 py-8 text-center">Carregando...</div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-6">
        <header className="space-y-1">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-display">Configuração do agente</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setBaseFileOpen(true)}>
              <FileText className="h-3.5 w-3.5" />
              Baixar arquivo base IA
            </Button>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Esse é o agente que conversa com <strong>seus clientes</strong> no WhatsApp — o system
            prompt abaixo define a personalidade e as regras dele. Use {'{variavel}'} para
            inserir variáveis (digite {'{'} para escolher).
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
            Pra tirar suas próprias dúvidas sobre como usar o sistema, use o assistente em{' '}
            <span className="text-[var(--accent-primary)] font-semibold">Ajuda</span> — é um
            assistente diferente, feito pra você, não pros seus clientes.
          </p>
        </header>

        <Dialog
          open={baseFileOpen}
          onClose={() => setBaseFileOpen(false)}
          title="Arquivo base pra Base de Conhecimento"
          description="Escolha o segmento do seu negócio pra baixar o arquivo certo pra você."
          widthClass="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Cada arquivo já vem com as perguntas certas pro seu tipo de negócio, mais uma seção
              geral (sobre você) e uma seção sobre COMO você quer que a IA se comporte.
            </p>
            <div className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-3">
              <p className="text-sm text-[var(--color-text-primary)] font-semibold">
                Atenção ao escrever
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                A IA segue exatamente o que estiver escrito — erro de português, frase confusa ou
                informação errada vira erro de verdade na conversa com o cliente. Escreva com
                calma, revise antes de subir, e preencha com o máximo de detalhe possível.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] opacity-70">
                Escolha o seu segmento
              </p>
              <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {SEGMENTS.map((seg) => (
                  <SegmentCard key={seg.id} segment={seg} onDownload={() => downloadBaseFile(seg)} />
                ))}
              </div>
            </div>

            <div className="space-y-1 text-xs text-[var(--color-text-secondary)] opacity-70">
              <p className="font-semibold text-[var(--color-text-primary)] opacity-100">Depois de baixar:</p>
              <p>Preencha tudo com informação real, salve, e suba esse mesmo arquivo aqui embaixo em Base de conhecimento.</p>
            </div>
          </div>
        </Dialog>

        <div className="space-y-2 relative">
          <Label htmlFor="system_prompt">System prompt</Label>
          <textarea
            id="system_prompt"
            ref={promptRef}
            value={systemPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onBlur={() => setTimeout(() => setVarMenu(null), 150)}
            rows={12}
            disabled={saving}
            className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white/[0.06]"
          />
          {varMenu && menuMatches.length > 0 && (
            <div className="absolute z-20 mt-1 w-64 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-[var(--color-bg-primary)] shadow-2xl overflow-hidden">
              {menuMatches.map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertVariable(k);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] hover:bg-[rgba(var(--accent-secondary-rgb),0.12)]"
                >
                  {`{${k}}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Variáveis */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Variáveis</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addVar} disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
            As 4 primeiras já vêm prontas (nome do negócio e profissão puxados do seu
            cadastro) — o prompt padrão já usa todas elas. Referencie no prompt com{' '}
            {'{chave}'}. Automáticas (preenchidas em runtime, não precisa criar):{' '}
            {AUTO_VARS.map((k) => `{${k}}`).join(', ')}.
          </p>
          <div className="space-y-2">
            {variables.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={v.key}
                  onChange={(e) => setVar(i, { key: e.target.value })}
                  placeholder="chave"
                  disabled={saving}
                  className="font-mono max-w-[220px]"
                />
                <span className="text-[var(--color-text-secondary)]">=</span>
                <Input
                  value={v.value}
                  onChange={(e) => setVar(i, { value: e.target.value })}
                  placeholder={VAR_PLACEHOLDER[v.key.trim()] ?? 'valor'}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVar(i)}
                  disabled={saving}
                  aria-label="Remover variável"
                >
                  <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Canais ativos (Módulo 6) — cada canal liga/desliga a IA de forma
            independente. Desligado → conversas do canal vão direto para humano.
            São o interruptor principal da IA (não há mais toggle global). */}
        <div className="space-y-2">
          <Label>Canais atendidos pela IA</Label>
          <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
            Ligue ou desligue a IA por canal. Se um canal estiver desligado, as conversas
            dele vão direto para atendimento humano.
          </p>
          <div className="max-w-2xl">
            <label className="flex items-center gap-3 h-11 px-4 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] cursor-pointer">
              <input
                type="checkbox"
                checked={activeWhatsapp}
                onChange={(e) => setActiveWhatsapp(e.target.checked)}
                disabled={saving}
                className="accent-[var(--accent-primary)] h-4 w-4"
              />
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              <span className="text-sm text-[var(--color-text-primary)]">
                Ativo no WhatsApp
              </span>
            </label>
          </div>
        </div>

        {/* Configurações Avançadas */}
        <div className="rounded-xl border border-[rgba(var(--accent-secondary-rgb),0.12)] bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              Configurações Avançadas
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-[var(--color-text-secondary)] transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-[rgba(var(--accent-secondary-rgb),0.1)] p-5">
              <div className="space-y-2">
                <Label htmlFor="model">Modelo de IA</Label>
                <select
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={saving}
                  className="h-11 w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 text-sm text-[var(--color-text-primary)]"
                >
                  {GPT_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {MODEL_LABELS[m] ?? m}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
                  Qual "cérebro" responde seus clientes. O Standard já é rápido e com boa
                  qualidade — só troque pro Pro se quiser respostas mais refinadas.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Fuso horário</Label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={saving}
                  className="h-11 w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 text-sm text-[var(--color-text-primary)]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
                  Usado só pra IA saber se está dentro do seu horário de atendimento. O Brasil
                  tem horas diferentes por região (Manaus e Rio Branco não são a mesma hora de São
                  Paulo) — escolha o fuso de onde você atende.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Criatividade da resposta ({temperature.toFixed(1)})</Label>
                <input
                  id="temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  disabled={saving}
                  className="w-full accent-[var(--accent-primary)]"
                />
                <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
                  Mais baixo = respostas mais previsíveis, sempre parecidas. Mais alto = respostas
                  mais variadas e naturais, mas com mais chance de fugir do tom. 0,7–0,8 é um bom
                  meio-termo.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Tamanho máximo da resposta</Label>
                <Input
                  id="max_tokens"
                  type="number"
                  min={100}
                  max={800}
                  step={100}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  disabled={saving}
                />
                <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
                  É um TETO, não um valor fixo — a IA para de escrever quando termina a ideia. Na
                  prática, a maioria das respostas usa bem menos que isso; esse número só evita um
                  texto gigante fora do padrão de uma conversa de WhatsApp.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>Salvar alterações</>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
