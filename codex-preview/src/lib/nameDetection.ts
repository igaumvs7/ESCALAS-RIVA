// ----------------------------------------------------------------------------
// nameDetection — extrai o PRIMEIRO NOME de dentro do texto salvo como "nome"
// do contato (sem IA, sem custo, roda na hora). Espelha
// webjs-worker/src/nameValidator.js::resolveDisplayName — o disparo em massa
// usa a MESMA lógica, então o que aparece aqui como "nome detectado" é
// exatamente o nome usado pra personalizar a mensagem.
//
// Casos reais que moldaram essa regra (2026-08-29/30, exemplos do dono):
// - "# Danuzio Avante", "Roberto 07", "Daniel Paiva/consultor..." — símbolo
//   ou código colado junto → tokeniza (tudo que não é letra/número vira
//   separador) e pega o 1º pedaço válido.
// - "𝓜𝓪𝓽𝓮𝓾𝓼 𝓢𝓲𝓵𝓿𝓪" (fonte estilizada de Instagram/WhatsApp) → parece
//   ilegível, mas normaliza pra "Mateus Silva" de verdade via Unicode NFKC.
// - "M A R I A" (nome espaçado letra por letra, estética comum em bio) →
//   junta as letras soltas antes de tokenizar.
// - "ANTONIO DAMASCENO" / "DARIO PINHEIRO DA SILVA" (maiúsculo comprido) →
//   são nomes de verdade, não empresa — não rejeita mais só por ser longo e
//   maiúsculo, usa lista de palavras de empresa/ramo em vez disso.
// - "Alcântara" sozinho → é sobrenome, não primeiro nome — lista de
//   sobrenomes comuns evita usar isso como nome de saudação.
// - "Haridade7" → letra+número grudados sem separador = parece usuário/
//   apelido, não nome — nunca tenta "salvar" removendo só o número.
// ----------------------------------------------------------------------------

const GENERIC_PLACEHOLDERS = new Set([
  'cliente', 'lead', 'contato', 'sem', 'nome', 'informado', 'na', 'n/a',
  'desconhecido', 'teste', 'test', 'usuario', 'user',
]);

// Conectores de nome composto — nunca escolhidos como PRIMEIRO nome sozinhos.
const NAME_CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'van', 'von', 'del', 'la', 'le']);

// Palavras de empresa/ramo coladas junto do nome. Heurística, não dicionário
// — completar conforme aparecer caso novo real.
const BUSINESS_WORDS = new Set([
  'ltda', 'me', 'eireli', 'epp', 'sa', 'cia', 'corp', 'inc', 'grupo', 'empresa',
  'empresarial', 'empreendimentos', 'consultoria', 'consultor', 'assessoria',
  'imobiliaria', 'imoveis', 'corretora', 'loja', 'magazine', 'mercado',
  'supermercado', 'farmacia', 'padaria', 'restaurante', 'lanchonete', 'academia',
  'clinica', 'hospital', 'escritorio', 'advocacia', 'engenharia', 'construcao',
  'construtora', 'distribuidora', 'atacado', 'varejo', 'comercio', 'comercial',
  'servicos', 'solucoes', 'tecnologia', 'sistemas', 'software', 'seguros',
  'seguradora', 'banco', 'financeira', 'credito', 'emprestimos', 'previdencia',
  'shopping', 'bikes', 'acessorios', 'pet', 'petshop', 'autopecas', 'pecas',
  'oficina', 'transportes', 'logistica', 'materiais',
]);

// Sobrenomes comuns — quando é a ÚNICA palavra do texto, não vira "primeiro
// nome" (ex.: "Alcântara" sozinho é sobrenome, não é como a pessoa se
// apresenta). Lista curta e de alta precisão, não exaustiva.
const SURNAME_WORDS = new Set([
  'silva', 'santos', 'souza', 'sousa', 'oliveira', 'pereira', 'costa', 'rodrigues',
  'almeida', 'nascimento', 'lima', 'araujo', 'fernandes', 'carvalho', 'gomes',
  'martins', 'rocha', 'ribeiro', 'alves', 'monteiro', 'mendes', 'barros', 'freitas',
  'barbosa', 'pinto', 'moura', 'cavalcanti', 'cavalcante', 'cardoso', 'correia',
  'teixeira', 'machado', 'melo', 'moraes', 'morais', 'vieira', 'andrade', 'nunes',
  'marques', 'figueiredo', 'castro', 'campos', 'cunha', 'pires', 'ramos', 'reis',
  'dias', 'farias', 'batista', 'brito', 'sales', 'xavier', 'guimaraes', 'siqueira',
  'amaral', 'duarte', 'franca', 'peixoto', 'vasconcelos', 'albuquerque', 'bezerra',
  'diniz', 'falcao', 'feitosa', 'frota', 'gurgel', 'leitao', 'linhares', 'magalhaes',
  'maia', 'meireles', 'mesquita', 'miranda', 'navarro', 'pacheco', 'paiva',
  'queiroz', 'rezende', 'sampaio', 'sarmento', 'serpa', 'tavares', 'valadares',
  'wanderley', 'alcantara', 'goncalves', 'lopes', 'pimentel', 'sobrinho',
  'damasceno', 'filgueiras', 'pinheiro',
]);

// Primeiros nomes comuns — usada só quando um "pedaço" ficou grande demais
// (>14 letras), sinal de nome+sobrenome grudados sem separador (ex.: nome
// digitado letra por letra: "T H A Í S F I L G U E I R A S"). Acha o maior
// prefixo conhecido em vez de usar o bloco inteiro (evitaria mandar "Oi,
// Thaisfilgueiras!"). Lista não exaustiva — nome raro nesse formato ainda
// cai pra "não identificado", o que é seguro (nunca chuta errado).
const FIRST_NAMES = new Set([
  'joao', 'jose', 'antonio', 'francisco', 'carlos', 'paulo', 'pedro', 'lucas',
  'luiz', 'marcos', 'luis', 'gabriel', 'rafael', 'daniel', 'marcelo', 'bruno',
  'eduardo', 'felipe', 'rodrigo', 'fernando', 'diego', 'leonardo', 'vinicius',
  'gustavo', 'guilherme', 'igor', 'renato', 'roberto', 'ricardo', 'alexandre',
  'andre', 'vitor', 'victor', 'mateus', 'thiago', 'tiago', 'caio', 'cesar',
  'cristiano', 'danilo', 'douglas', 'emerson', 'fabio', 'fabricio', 'flavio',
  'gilberto', 'henrique', 'hugo', 'ivan', 'jefferson', 'jonathan', 'jorge',
  'julio', 'leandro', 'marcio', 'mauricio', 'nelson', 'nilton', 'osvaldo',
  'sergio', 'valdir', 'wagner', 'wallace', 'wesley', 'anderson', 'adriano',
  'alessandro', 'alan', 'ariel', 'arthur', 'artur', 'benedito', 'bernardo',
  'breno', 'caique', 'claudio', 'cleiton', 'dario', 'danuzio', 'davi', 'david',
  'denis', 'edson', 'elias', 'elton', 'enzo', 'erick', 'erik', 'ernesto',
  'everton', 'geraldo', 'getulio', 'heitor', 'helio', 'ismael', 'israel', 'ivo',
  'jair', 'jean', 'joaquim', 'joel', 'junior', 'kaique', 'kaua', 'kevin', 'lauro',
  'levi', 'lorenzo', 'luan', 'mario', 'matheus', 'miguel', 'milton', 'moacir',
  'murilo', 'nicolas', 'noah', 'oscar', 'otavio', 'pablo', 'patrick', 'raul',
  'renan', 'robson', 'rogerio', 'ronaldo', 'samuel', 'sandro', 'silvio', 'tadeu',
  'theo', 'thomas', 'valdemar', 'valentim', 'wanderson', 'william', 'yago',
  'yuri', 'marlon', 'wellington', 'raimundo', 'sebastiao', 'severino', 'ana',
  'maria', 'mariana', 'juliana', 'camila', 'amanda', 'bruna', 'bianca', 'carla',
  'carolina', 'cristina', 'daniela', 'debora', 'diana', 'elaine', 'eliane',
  'elisa', 'fabiana', 'fernanda', 'flavia', 'gabriela', 'giovanna', 'helena',
  'isabela', 'isabel', 'isabella', 'jessica', 'joana', 'julia', 'karina', 'karla',
  'katia', 'larissa', 'laura', 'leticia', 'lidia', 'lilian', 'lorena', 'luana',
  'lucia', 'luciana', 'luiza', 'manuela', 'marcela', 'marcia', 'marina',
  'michele', 'michelle', 'milena', 'monica', 'natalia', 'nathalia', 'patricia',
  'paula', 'priscila', 'raquel', 'rafaela', 'regina', 'renata', 'rita', 'roberta',
  'rosana', 'sabrina', 'sandra', 'sara', 'silvana', 'silvia', 'simone', 'sofia',
  'sonia', 'suellen', 'talita', 'tatiana', 'thais', 'vanessa', 'vera', 'veronica',
  'viviane', 'yasmin', 'joice', 'jully', 'jullia', 'kamilly', 'emilly', 'ingrid',
  'jaqueline', 'francisca', 'antonia', 'aparecida', 'conceicao', 'socorro',
]);

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toTitleCase(word: string): string {
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR');
}

// Junta letras soltas separadas por espaço (ex.: "M A R I A" → "MARIA") antes
// de tokenizar — estética comum de bio/perfil. Só junta letra isolada com
// letra isolada (nunca mexe na última letra de uma palavra normal, tipo
// "BIKES E ACESSÓRIOS" — o "S" de BIKES não é uma letra isolada).
const SPACE_CLASS = "[ \\u00A0\\u2000-\\u200B\\u202F\\u205F\\u3000]";
const SPACED_LETTERS_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(\\p{L})${SPACE_CLASS}+(?=\\p{L}(?:[^\\p{L}\\p{N}]|$))`,
  'gu',
);
function collapseSpacedLetters(text: string): string {
  let prev: string;
  let out = text;
  do {
    prev = out;
    out = out.replace(SPACED_LETTERS_RE, '$1');
  } while (out !== prev);
  return out;
}

// Acha o maior nome conhecido no INÍCIO de um pedaço grande demais (nome +
// sobrenome grudados). Ex.: "thaisfilgueiras" → "thais".
function findFirstNamePrefix(token: string): string | null {
  const normalized = stripAccents(token).toLowerCase();
  const maxLen = Math.min(normalized.length - 2, 12);
  for (let len = maxLen; len >= 2; len--) {
    if (FIRST_NAMES.has(normalized.slice(0, len))) return token.slice(0, len);
  }
  return null;
}

/** Extrai o primeiro nome de pessoa de dentro do texto, ou null se não achar nenhum. */
export function detectFirstName(name: string | null | undefined): string | null {
  if (!name) return null;
  let trimmed = name.trim();
  if (!trimmed) return null;

  // Unicode NFKC: converte fonte estilizada ("𝓜𝓪𝓽𝓮𝓾𝓼") de volta pra letra
  // normal ("Mateus") — resolve o problema real de "fonte que não dá pra ler".
  trimmed = trimmed.normalize('NFKC');
  trimmed = collapseSpacedLetters(trimmed);

  // "Palavras" = sequências de letra/número, opcionalmente unidas por hífen
  // ou apóstrofo interno (nome composto tipo "Ana-Maria", "D'Ávila). Tudo
  // mais (#, |, /, ;, :, ., espaço...) vira separador automaticamente.
  const tokens = trimmed.match(/[\p{L}\d]+(?:['’-][\p{L}\d]+)*/gu) ?? [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue; // só número (código/ID) — pula
    if (/\d/.test(token)) continue; // letra+número grudado (ex.: "haridade7") — parece usuário/handle
    if (token.length < 2 || token.length > 24) continue;

    const normalized = stripAccents(token).toLowerCase();
    if (NAME_CONNECTORS.has(normalized)) continue;
    if (GENERIC_PLACEHOLDERS.has(normalized)) continue;
    if (BUSINESS_WORDS.has(normalized)) continue;
    if (SURNAME_WORDS.has(normalized)) continue;
    if (!/[aeiou]/i.test(normalized)) continue; // sem vogal = não parece nome
    if (/^(.)\1+$/i.test(token)) continue; // letra repetida (ex.: "aaaa")

    if (token.length > 14) {
      const prefix = findFirstNamePrefix(token);
      if (prefix) return toTitleCase(prefix);
      continue; // bloco grande sem nome conhecido no início — não arrisca
    }
    return toTitleCase(token);
  }
  return null;
}
