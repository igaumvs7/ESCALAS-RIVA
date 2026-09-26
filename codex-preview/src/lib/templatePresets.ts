// ----------------------------------------------------------------------------
// templatePresets — modelos prontos pra campanha de imóveis, cada um com o
// gatilho psicológico por trás explicado em português simples. Pedido do
// dono (2026-08-27): "utilize a psicanálise do cérebro humano... leitor de
// pessoas e psicólogo de comportamento".
//
// Princípios usados são os gatilhos de persuasão mais estudados/replicados
// (Cialdini: reciprocidade, prova social, escassez, autoridade, consistência;
// mais o efeito Zeigarnik de curiosidade e a heurística de esforço cognitivo
// em perguntas). Nenhum usa escassez FALSA — o template de oferta com prazo
// avisa explicitamente que só deve ser usado quando o prazo é real.
// ----------------------------------------------------------------------------

export interface TemplatePreset {
  id: string;
  category: string;
  name: string;
  principle: string;
  body: string;
  why: string;
  // Explicação de cada {{n}} — pedido do dono: "explique sobre as
  // variáveis, como é que funciona".
  variables: Record<string, string>;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'boas_vindas_novo_lead',
    category: 'Primeiro contato',
    name: 'Boas-vindas com pergunta de 3 opções',
    principle: 'Esforço cognitivo baixo',
    body: 'Oi {{1}}! Vi que você se interessou por um dos nossos imóveis. Meu nome é {{2}} e vou te ajudar a encontrar exatamente o que você procura — pode me contar rapidinho o que é mais importante pra você: localização, tamanho ou preço?',
    why: 'Perguntas abertas ("o que você procura?") geram fadiga de decisão e poucas respostas. Oferecer 3 opções concretas reduz o esforço mental — a pessoa só escolhe, não precisa elaborar do zero, o que aumenta bastante a chance de resposta.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)', '2': 'Seu nome ou o nome de quem vai atender' },
  },
  {
    id: 'primeiro_contato_curiosidade',
    category: 'Primeiro contato',
    name: 'Abertura com gancho de curiosidade',
    principle: 'Efeito Zeigarnik (curiosidade)',
    body: 'Oi {{1}}! Vi seu interesse no imóvel que você olhou recentemente — separei 2 detalhes sobre ele que a maioria das pessoas não repara à primeira vista. Posso te contar rapidinho?',
    why: 'O cérebro tem dificuldade de deixar uma informação incompleta sem buscar completá-la. Anunciar que existem "detalhes que a maioria não repara" sem revelar qual cria uma abertura mental que a pessoa quer fechar — respondendo.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)' },
  },
  {
    id: 'confirmacao_visita',
    category: 'Agendamento',
    name: 'Confirmação de visita com prova social leve',
    principle: 'Prova social',
    body: 'Show, {{1}}! Sua visita está confirmada. Só um detalhe: imóveis assim, nessa faixa de preço e região, costumam ter mais de uma visita marcada na mesma semana — então se rolar qualquer imprevisto de horário, me avisa o quanto antes que eu já vejo outro horário pra você.',
    why: 'Mencionar que outras pessoas também têm interesse reforça o valor percebido do imóvel sem soar como discurso de vendas — porque vem embutido numa mensagem prática de confirmação, não como pressão direta.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)' },
  },
  {
    id: 'pos_visita_fechamento',
    category: 'Pós-visita',
    name: 'Follow-up pedindo opinião sincera',
    principle: 'Compromisso e consistência',
    body: 'Oi {{1}}, o que achou da visita de hoje? Quero muito ouvir sua primeira impressão sincera — é isso que me ajuda a te trazer só imóveis que realmente fazem sentido pra você daqui pra frente.',
    why: 'Pedir a opinião sincera (em vez de "vai fechar?") ativa o princípio do compromisso: quem verbaliza uma opinião tende a manter consistência com ela depois, e você ainda ganha informação real pra qualificar o lead.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)' },
  },
  {
    id: 'recuperacao_interesse_perdido',
    category: 'Reengajamento',
    name: 'Recuperação de lead frio, sem soar genérico',
    principle: 'Atenção pessoal',
    body: 'Oi {{1}}! Lembrei de você porque apareceu um imóvel parecido com o que você tinha visto antes, só que com uma condição bem melhor. Vale a pena eu te mandar?',
    why: 'Mensagens que citam um contexto específico anterior (em vez de um disparo genérico) fazem a pessoa sentir que foi lembrada individualmente, não que recebeu spam em massa — isso aumenta bastante a taxa de resposta.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)' },
  },
  {
    id: 'reengajamento_lead_frio',
    category: 'Reengajamento',
    name: 'Reengajamento dando a saída fácil',
    principle: 'Redução de reatância',
    body: 'Oi {{1}}, tudo bem? Faz um tempinho que a gente não conversa sobre o imóvel — ainda está na sua lista de interesse ou seu momento mudou? Só pra eu não continuar te enviando algo que não faz mais sentido pra você :)',
    why: 'Dar a opção explícita de dizer "não" reduz a resistência psicológica de responder. Parece contraintuitivo, mas quem não se sente pressionado responde mais — em vez de simplesmente ignorar a mensagem.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)' },
  },
  {
    id: 'prova_social_geral',
    category: 'Autoridade',
    name: 'Abertura com número de famílias atendidas',
    principle: 'Prova social + autoridade',
    body: 'Oi {{1}}! Esse mês já ajudei {{2}} famílias a encontrarem o imóvel ideal na sua região — separei um que combina bastante com o que você procura. Posso te mostrar?',
    why: 'Números concretos de outras pessoas atendidas funcionam como atalho de confiança: "se tanta gente confiou, deve ser confiável". Um dos gatilhos de persuasão mais estudados (Cialdini).',
    variables: { '1': 'Nome do contato (preenchido automaticamente)', '2': 'Número de famílias/clientes atendidos (edite pra um número real)' },
  },
  {
    id: 'oferta_tempo_limitado',
    category: 'Oferta',
    name: 'Condição especial com prazo (use só se for real)',
    principle: 'Aversão à perda',
    body: '{{1}}, hoje recebi uma condição especial pra esse imóvel válida só até {{2}} — depois disso volta ao valor normal. Quer que eu te mande os detalhes?',
    why: 'Prazos concretos ativam a aversão à perda: dói mais perder uma oportunidade do que dá prazer ganhar uma. IMPORTANTE: só use esse modelo quando o prazo for verdadeiro — urgência falsa é percebida com o tempo e destrói a confiança no corretor.',
    variables: { '1': 'Nome do contato (preenchido automaticamente)', '2': 'Data limite real da condição especial' },
  },
];

export const TEMPLATE_PRESET_CATEGORIES: string[] = Array.from(
  new Set(TEMPLATE_PRESETS.map((p) => p.category)),
);
