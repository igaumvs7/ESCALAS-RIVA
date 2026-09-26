import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DocSection {
  id: string;
  title: string;
  body: string[];
}

// ----------------------------------------------------------------------------
// HelpDocs — "aba de ajuda/informações... ensine a fazer tudo e cada
// detalhe do sistema" (pedido do dono, 2026-08-27). Conteúdo estático,
// organizado por área do sistema — a mesma lista que o system prompt do
// help-assistant usa, só que escrita pra leitura (mais detalhe, formatado).
// ----------------------------------------------------------------------------
const SECTIONS: DocSection[] = [
  {
    id: 'vivas-envia',
    title: 'Vivas Envia — conectar e disparar mensagens',
    body: [
      'Abra Vivas Envia e escaneie o QR code com o celular que vai enviar as mensagens (WhatsApp → Aparelhos conectados → Conectar um aparelho). Assim que conectar, a tela vira o Disparador.',
      'Aba Disparador: o "Disparo rápido" no topo já deixa escrever a mensagem (ou até 5 variações, que se alternam sozinhas de forma aleatória a cada envio), escolher todos os contatos ou por tag, e mandar. Pra agendar ou usar campo customizado, tem o "Disparo avançado".',
      'Aba Templates: mensagens já vêm prontas, organizadas em pastas — clique numa pasta e depois num modelo pra ver o texto e a explicação de cada variável. Pode editar, ou pedir pra IA gerar um novo. Dentro de qualquer mensagem do Disparador, o botão de pasta puxa o texto de um template direto pra ali.',
      'Aba Segurança do chip: escolha o ritmo de disparo (seguro, moderado ou arriscado) e veja a nota de proteção (0 a 10) e como funciona a proteção contra bloqueio.',
      'Aba Não responderam: lista quem foi contatado e nunca respondeu — dá pra reenviar mensagem só pra esse grupo.',
      'Aba Origem dos leads: gera links marcados pra saber de onde veio cada lead (Instagram, anúncio pago, etc).',
    ],
  },
  {
    id: 'contatos',
    title: 'Contatos — importar e organizar sua base',
    body: [
      'Botão "Importar contatos" aceita arquivo .csv, .xlsx ou .xls — suba a planilha, diga qual coluna é telefone/nome/e-mail e confirme.',
      'Use tags pra organizar contatos em grupos (ex.: "cliente vip", "interessado em apartamento") — depois dá pra disparar campanha só pra quem tem uma tag específica.',
      'Clique num contato pra ver o histórico completo de conversa e dados dele.',
    ],
  },
  {
    id: 'inbox',
    title: 'Inbox — conversar com os leads',
    body: [
      'Todas as conversas do WhatsApp aparecem aqui em tempo real, com 3 áreas: lista de conversas, a conversa aberta, e os dados do contato ao lado.',
      'A IA responde sozinha até alguém clicar em "Pausar IA" — a partir daí, um humano assume aquela conversa.',
      'Notas privadas (nunca aparecem pro contato) ajudam a deixar um lembrete anotado na conversa.',
    ],
  },
  {
    id: 'agente-ia',
    title: 'Agente de IA — configurar como ela responde',
    body: [
      'Escreva o "prompt" — as instruções de como a IA deve se comportar, o tom de voz, o que ela pode e não pode prometer. Sem isso preenchido, quem escrever pra você cai direto no atendimento humano — a IA fica "desligada" até você configurar.',
      'Botão "Baixar arquivo base IA" (no topo da tela): baixa um roteiro de perguntas prontas pro seu tipo de negócio (corretor, saúde, loja, etc.). Responda as perguntas, salve o arquivo, e suba ele na Base de conhecimento — é o jeito mais rápido de deixar a IA bem informada sem ficar pensando no que escrever do zero.',
      'Base de conhecimento: além do arquivo acima, dá pra subir PDFs, documentos ou links — a IA usa esse material pra responder com informação real sobre seus produtos/serviços, em vez de inventar.',
      'Configurações Avançadas: modelo de IA (Standard = rápido e econômico; Pro = respostas mais refinadas), criatividade da resposta e tamanho máximo — os padrões já vêm bons, só mexa se quiser ajustar o estilo.',
      'Defina o horário de atendimento — fora dele, dá pra configurar o que acontece com quem escreve.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard — acompanhar os números',
    body: [
      'Mostra contagem de leads: quantos foram contatados, quantos responderam, quantos a IA está atendendo, quantos foram transferidos pra um humano, quantos viraram venda.',
      'Não é uma tela de faturamento — é sobre volume e progresso de atendimento.',
    ],
  },
  {
    id: 'vivas-perfil',
    title: 'Vivas Perfil — seu site público (Plano Jarvis)',
    body: [
      'Uma página pública com seus dados de corretor e imóveis — o link que você divulga pra captar leads novos.',
      'Quem preenche o formulário nessa página vira um contato automaticamente e cai direto no seu Inbox.',
    ],
  },
  {
    id: 'configuracoes',
    title: 'Configurações — conta e visual',
    body: [
      'Aba Conta: seus dados de perfil (nome, foto — passe o mouse em cima da foto pra trocar ou remover —, senha).',
      'Aba Temas: várias paletas de cor pro visual do sistema — é preferência pessoal, salva no seu navegador.',
    ],
  },
  {
    id: 'feedback',
    title: 'Feedback — fale com quem cuida do sistema',
    body: [
      'Mande sugestão, elogio ou problema direto pro dono da plataforma — clique em "Novo feedback", escreva e envie.',
      'Acompanhe a conversa ali mesmo: quando responderem, você é avisado nas notificações (sininho no topo).',
      'Não é o mesmo assistente de IA — aqui é uma mensagem de verdade, lida por uma pessoa.',
    ],
  },
];

export function HelpDocs() {
  const [open, setOpen] = useState<string | null>(SECTIONS[0]?.id ?? null);

  return (
    <div className="space-y-2">
      {SECTIONS.map((section) => {
        const isOpen = open === section.id;
        return (
          <Card key={section.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : section.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-sm font-bold">{section.title}</span>
              <ChevronDown
                className={cn('h-4 w-4 text-[var(--color-text-secondary)] transition-transform flex-shrink-0', isOpen && 'rotate-180')}
              />
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2 pt-3 border-t border-[rgba(var(--accent-secondary-rgb),0.08)]">
                {section.body.map((p, i) => (
                  <p key={i} className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
