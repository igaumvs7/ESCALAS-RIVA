import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description: string;
  pageLabel: string;
  details: string[];
  to: string;
  required: boolean;
}

// ----------------------------------------------------------------------------
// OnboardingChecklist — "tutorial inicial: tudo que a pessoa precisa fazer
// ao acessar pela primeira vez" (pedido do dono, 2026-08-27). Ordem segue o
// fluxo real do produto. Progresso salvo no navegador (localStorage) — é
// conveniência pessoal de quem está configurando, não precisa sincronizar
// entre dispositivos nem aparecer pra outros membros da equipe.
//
// 2026-08-29 (pedido do dono): clicar num passo não joga mais direto pra
// tela — abre um diálogo com o passo a passo detalhado primeiro, e só lá
// dentro tem o botão pra ir. "Ir lá" trocado por "Acessar [tela]" (achou
// muito informal).
// ----------------------------------------------------------------------------
const STEPS: Step[] = [
  {
    id: 'connect-whatsapp',
    title: 'Conectar seu WhatsApp',
    description: 'Escaneie o QR code pra ligar o número que vai enviar e receber mensagens.',
    pageLabel: 'Vivas Envia',
    to: '/vivas-envia',
    required: true,
    details: [
      'Abra o WhatsApp no celular que vai usar pra atender seus clientes.',
      'No celular: toque nos 3 pontinhos (ou Configurações) > Aparelhos conectados > Conectar um aparelho.',
      'No sistema, aponte a câmera do celular pro QR code que aparece na tela.',
      'Espere alguns segundos até a tela mostrar "Conectado" — pronto, esse número já manda e recebe mensagem pelo sistema.',
    ],
  },
  {
    id: 'configure-ai',
    title: 'Configurar o Agente de IA',
    description: 'Escreva como a IA deve se comportar e o que ela sabe sobre seu negócio.',
    pageLabel: 'Agente de IA',
    to: '/ai-agent',
    required: true,
    details: [
      'Clique no botão "Baixar arquivo base IA" no topo da tela e escolha o segmento do seu negócio.',
      'Preencha as perguntas do arquivo com informação real — quanto mais completo, melhor a IA responde.',
      'Cole ou escreva as instruções principais no campo de texto grande da tela (o "prompt").',
      'Suba o arquivo que você preencheu na aba Base de conhecimento — ela também aceita PDF, documento do Word e link de página, se você já tiver material pronto (catálogo, apresentação, site).',
      'Clique em salvar — a partir daqui, quando um cliente escrever, a IA já responde sozinha.',
    ],
  },
  {
    id: 'import-contacts',
    title: 'Importar seus contatos',
    description: 'Suba uma planilha (.csv ou .xlsx) com nome e telefone de quem você quer alcançar.',
    pageLabel: 'Contatos',
    to: '/contacts',
    required: true,
    details: [
      'Clique em "Importar contatos".',
      'Suba o arquivo da sua planilha (.csv, .xlsx ou .xls).',
      'Confirme qual coluna é nome e qual é telefone — o sistema tenta adivinhar sozinho.',
      'Pronto, seus contatos já ficam disponíveis pra receber mensagem.',
    ],
  },
  {
    id: 'create-template',
    title: 'Dar uma olhada nos modelos de mensagem',
    description: 'Vários já vêm prontos, organizados em pastas — dá pra usar direto ou editar.',
    pageLabel: 'Vivas Envia',
    to: '/vivas-envia?tab=templates',
    required: true,
    details: [
      'Vá na aba Templates, dentro de Vivas Envia.',
      'Clique numa pasta pra ver os modelos daquela categoria.',
      'Abra um modelo pra ver o texto pronto e a explicação de cada variável.',
      'Pode editar o texto, ou pedir pra IA gerar um novo do zero.',
      'Dentro de qualquer mensagem do Disparador, o botão de pasta puxa um template pronto direto pra ali.',
    ],
  },
  {
    id: 'dispatch-settings',
    title: 'Escolher o ritmo de disparo',
    description: 'Confira o modo seguro (recomendado) antes de mandar mensagem em massa.',
    pageLabel: 'Vivas Envia',
    to: '/vivas-envia?tab=campanhas',
    required: true,
    details: [
      'Dentro do Disparador, ache a seção "Ritmo de disparo".',
      'Pra número novo, deixe no modo Seguro — ele manda mais devagar, com pausas, imitando alguém digitando.',
      'Veja a nota de proteção (0 a 10): quanto mais alta, menor o risco do WhatsApp bloquear o número.',
      'Só troque pro modo mais rápido depois que o número já estiver "aquecido" (algumas semanas de uso normal).',
    ],
  },
  {
    id: 'first-dispatch',
    title: 'Fazer seu primeiro disparo',
    description: 'Escreva a mensagem, escolha a audiência e mande — é uma tela só.',
    pageLabel: 'Vivas Envia',
    to: '/vivas-envia?tab=campanhas',
    required: true,
    details: [
      'No topo do Disparador, escreva sua mensagem (ou puxe um modelo pronto pelo botão de pasta).',
      'Escolha pra quem vai: todos os contatos, só quem tem uma tag específica, ou suba uma lista nova na hora.',
      'Confira o ritmo de disparo escolhido no passo anterior.',
      'Clique em enviar — acompanhe o andamento na aba Histórico de disparos.',
    ],
  },
  {
    id: 'agent-site',
    title: 'Configurar o Vivas Perfil',
    description: 'Seu site público pra captar leads novos — opcional, disponível no Plano Jarvis.',
    pageLabel: 'Vivas Perfil',
    to: '/vivas-perfil',
    required: false,
    details: [
      'Preencha seus dados: nome, cidade, apresentação, redes sociais.',
      'Suba uma foto de capa e um avatar.',
      'Cadastre seus produtos/imóveis, cada um com foto.',
      'Publique — o link gerado é o que você divulga pra captar contato de leads novos.',
    ],
  },
  {
    id: 'pick-theme',
    title: 'Escolher um tema visual',
    description: 'Várias paletas de cor pra deixar o painel do seu jeito — opcional.',
    pageLabel: 'Configurações',
    to: '/settings/profile?tab=theme',
    required: false,
    details: [
      'Vá na aba Temas, dentro de Configurações.',
      'Clique num tema pra pré-visualizar — ele só é aplicado de verdade quando você salva.',
      'Clique em "Salvar tema" pra confirmar. Fica guardado nesse navegador.',
    ],
  },
];

const STORAGE_KEY = 'vivas_onboarding_done';

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [openStepId, setOpenStepId] = useState<string | null>(null);

  useEffect(() => {
    setDone(loadDone());
  }, []);

  const toggle = (id: string) => {
    setDone((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* localStorage indisponível — segue só em memória */
      }
      return next;
    });
  };

  const requiredSteps = STEPS.filter((s) => s.required);
  const requiredDone = requiredSteps.filter((s) => done.has(s.id)).length;
  const openStep = STEPS.find((s) => s.id === openStepId) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold">Primeiros passos</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Faça esses passos, na ordem, pra deixar sua conta pronta pra operar. Clique num passo
              pra ver o passo a passo detalhado.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-[var(--accent-primary)]">
              {requiredDone}/{requiredSteps.length}
            </div>
            <div className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">essenciais</div>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const checked = done.has(step.id);
          return (
            <Card key={step.id} className="p-0">
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggle(step.id)}
                  aria-label={checked ? 'Marcar como não feito' : 'Marcar como feito'}
                  className={cn(
                    'mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors',
                    checked
                      ? 'bg-[var(--color-success)] border-[var(--color-success)] text-white'
                      : 'border-[rgba(var(--accent-secondary-rgb),0.3)] text-transparent hover:border-[var(--accent-primary)]',
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpenStepId(step.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-[var(--color-text-secondary)]">{idx + 1}.</span>
                    <span className={cn('text-sm font-semibold', checked && 'line-through opacity-60')}>
                      {step.title}
                    </span>
                    {!step.required && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                        opcional
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{step.description}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenStepId(step.id)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                >
                  Ver passo a passo
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={Boolean(openStep)}
        onClose={() => setOpenStepId(null)}
        title={openStep?.title}
        widthClass="max-w-lg"
      >
        {openStep && (
          <div className="space-y-4">
            <ol className="space-y-2.5">
              {openStep.details.map((line, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--accent-primary)] text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-[var(--color-text-primary)]">{line}</span>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              onClick={() => {
                navigate(openStep.to);
                setOpenStepId(null);
              }}
              className="w-full justify-center"
            >
              Acessar {openStep.pageLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
