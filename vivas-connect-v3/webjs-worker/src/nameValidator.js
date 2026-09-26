'use strict';

// ----------------------------------------------------------------------------
// nameValidator — extrai o PRIMEIRO NOME de dentro do texto salvo como "nome"
// do contato. Espelha src/lib/nameDetection.ts (frontend, tela de Contatos)
// -- o nome que aparece la como "detectado" e exatamente o que o disparo usa
// aqui pra personalizar a mensagem.
//
// Casos reais que moldaram essa regra (2026-08-29/30, exemplos do dono):
// - "# Danuzio Avante", "Roberto 07", "Daniel Paiva/consultor..." -- simbolo
//   ou codigo colado junto -> tokeniza (tudo que nao e letra/numero vira
//   separador) e pega o 1o pedaco valido.
// - fonte estilizada de Instagram/WhatsApp (ex.: script/italic unicode) ->
//   parece ilegivel, mas normaliza pra letra normal via Unicode NFKC.
// - "M A R I A" (nome espacado letra por letra, estetica comum em bio) ->
//   junta as letras soltas antes de tokenizar.
// - "ANTONIO DAMASCENO" / "DARIO PINHEIRO DA SILVA" (maiusculo comprido) ->
//   sao nomes de verdade, nao empresa -- nao rejeita mais so por ser longo e
//   maiusculo, usa lista de palavras de empresa/ramo em vez disso.
// - "Alcantara" sozinho -> e sobrenome, nao primeiro nome -- lista de
//   sobrenomes comuns evita usar isso como nome de saudacao.
// - "Haridade7" -> letra+numero grudados sem separador = parece usuario/
//   apelido, nao nome -- nunca tenta "salvar" removendo so o numero.
// ----------------------------------------------------------------------------

const GENERIC_PLACEHOLDERS = new Set([
  'cliente', 'lead', 'contato', 'sem', 'nome', 'informado', 'na', 'n/a',
  'desconhecido', 'teste', 'test', 'usuario', 'user',
]);

const NAME_CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'van', 'von', 'del', 'la', 'le']);

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

// Sobrenomes comuns -- quando e a UNICA palavra do texto, nao vira "primeiro
// nome" (ex.: "Alcantara" sozinho e sobrenome). Lista curta, alta precisao.
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

// Primeiros nomes comuns -- usada so quando um "pedaco" ficou grande demais
// (>14 letras), sinal de nome+sobrenome grudados sem separador. Acha o maior
// prefixo conhecido em vez de usar o bloco inteiro. Lista nao exaustiva --
// nome raro nesse formato cai pra "nao identificado", o que e seguro (nunca
// chuta errado).
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

function stripAccents(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toTitleCase(word) {
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR');
}

// Junta letras soltas separadas por espaco (ex.: "M A R I A" -> "MARIA")
// antes de tokenizar. So junta letra isolada com letra isolada (nunca mexe
// na ultima letra de uma palavra normal, tipo "BIKES E ACESSORIOS").
const SPACE_CLASS = '[ \\u00A0\\u2000-\\u200B\\u202F\\u205F\\u3000]';
const SPACED_LETTERS_RE = new RegExp(
  '(?<![\\p{L}\\p{N}])(\\p{L})' + SPACE_CLASS + '+(?=\\p{L}(?:[^\\p{L}\\p{N}]|$))',
  'gu',
);
function collapseSpacedLetters(text) {
  let prev;
  let out = text;
  do {
    prev = out;
    out = out.replace(SPACED_LETTERS_RE, '$1');
  } while (out !== prev);
  return out;
}

// Acha o maior nome conhecido no INICIO de um pedaco grande demais (nome +
// sobrenome grudados). Ex.: "thaisfilgueiras" -> "thais".
function findFirstNamePrefix(token) {
  const normalized = stripAccents(token).toLowerCase();
  const maxLen = Math.min(normalized.length - 2, 12);
  for (let len = maxLen; len >= 2; len--) {
    if (FIRST_NAMES.has(normalized.slice(0, len))) return token.slice(0, len);
  }
  return null;
}

/**
 * Extrai o primeiro nome de pessoa de dentro do valor da planilha, ou null se
 * nao achar nenhum. Usado tanto pra decidir se personaliza a mensagem quanto
 * pra saber COM QUE NOME personalizar.
 */
function resolveDisplayName(rawValue) {
  if (rawValue == null) return null;
  let trimmed = String(rawValue).trim();
  if (!trimmed) return null;

  // Unicode NFKC: converte fonte estilizada de volta pra letra normal --
  // resolve o problema real de "fonte que nao da pra ler".
  trimmed = trimmed.normalize('NFKC');
  trimmed = collapseSpacedLetters(trimmed);

  const tokens = trimmed.match(/[\p{L}\d]+(?:['’-][\p{L}\d]+)*/gu) || [];

  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue; // so numero (codigo/ID) -- pula
    if (/\d/.test(token)) continue; // letra+numero grudado -- parece usuario/handle
    if (token.length < 2 || token.length > 24) continue;

    const normalized = stripAccents(token).toLowerCase();
    if (NAME_CONNECTORS.has(normalized)) continue;
    if (GENERIC_PLACEHOLDERS.has(normalized)) continue;
    if (BUSINESS_WORDS.has(normalized)) continue;
    if (SURNAME_WORDS.has(normalized)) continue;
    if (!/[aeiou]/i.test(normalized)) continue;
    if (/^(.)\1+$/i.test(token)) continue;

    if (token.length > 14) {
      const prefix = findFirstNamePrefix(token);
      if (prefix) return toTitleCase(prefix);
      continue; // bloco grande sem nome conhecido no inicio -- nao arrisca
    }
    return toTitleCase(token);
  }
  return null;
}

module.exports = { resolveDisplayName };
