'use strict';

// Palavras que aparecem com frequencia em planilhas no lugar de um nome de
// verdade (placeholder, valor padrao de sistema de origem, etc.)
const GENERIC_PLACEHOLDERS = new Set([
  'cliente',
  'lead',
  'contato',
  'sem nome',
  'nao informado',
  'n/a',
  'na',
  'desconhecido',
  'teste',
  'test',
  '-',
  '--',
  '.',
]);

function stripAccents(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Heuristica para decidir se um valor da coluna "Nome" parece um nome de
 * pessoa de verdade, para decidir se vale a pena personalizar a mensagem
 * com ele. Nao existe forma 100% certeira de validar isso (nomes reais sao
 * muito variados), entao a regra e conservadora: melhor deixar de
 * personalizar um nome valido raro do que mandar "Ola 11988887777" ou
 * "Ola SEM NOME" para o cliente.
 */
function isValidHumanName(rawValue) {
  if (rawValue == null) return false;
  const value = String(rawValue).trim();
  if (!value) return false;

  const normalized = stripAccents(value).toLowerCase();
  if (GENERIC_PLACEHOLDERS.has(normalized)) return false;

  if (value.length < 2 || value.length > 60) return false;

  // Contem digito -> quase certamente e telefone, CPF, codigo etc.
  if (/\d/.test(value)) return false;

  // Parece um e-mail ou tem @ no meio.
  if (value.includes('@')) return false;

  // So permite letras (com acentos), espaco, apostrofo e hifen.
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' \-]+$/.test(value)) return false;

  const letters = value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length < 2) return false;

  // Uma unica letra repetida (ex: "aaaaaa") nao e nome.
  if (/^(.)\1+$/i.test(letters)) return false;

  // Nome de verdade normalmente tem ao menos uma vogal.
  if (!/[aeiouàâãáéêíóôõúü]/i.test(letters)) return false;

  return true;
}

module.exports = { isValidHumanName };
