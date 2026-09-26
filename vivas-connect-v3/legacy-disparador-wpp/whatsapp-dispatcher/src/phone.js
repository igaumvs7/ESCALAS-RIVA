'use strict';

/**
 * Normaliza numeros de telefone brasileiros para o formato usado pelo
 * WhatsApp (DDI + DDD + numero, so digitos). Aceita entradas bagunçadas
 * vindas de planilha: com espaco, parenteses, traco, +, 0800 etc.
 */
function onlyDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/**
 * Retorna um array com as variantes plausiveis de um numero (com e sem o
 * nono digito), porque a planilha do cliente raramente vem padronizada e
 * o unico jeito confiavel de saber qual variante existe de fato no
 * WhatsApp e perguntando pro proprio WhatsApp (feito em whatsappClient.js
 * via getNumberId). Aqui so preparamos os candidatos.
 */
function buildCandidates(rawValue) {
  let digits = onlyDigits(rawValue);
  if (!digits) return [];

  // Remove zero(s) de discagem local no inicio, ex: 0(11)99999-9999
  digits = digits.replace(/^0+/, '');

  // Se ja vier com DDI 55 usamos como base, senao assumimos BR e prefixamos.
  let national;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    national = digits.slice(2);
  } else {
    national = digits;
  }

  // national esperado: DDD (2) + numero (8 ou 9 digitos)
  if (national.length < 10 || national.length > 11) {
    return [];
  }

  const ddd = national.slice(0, 2);
  let subscriber = national.slice(2);

  const candidates = new Set();

  if (subscriber.length === 9) {
    candidates.add(`55${ddd}${subscriber}`);
    candidates.add(`55${ddd}${subscriber.slice(1)}`); // sem o 9
  } else if (subscriber.length === 8) {
    candidates.add(`55${ddd}${subscriber}`);
    // celulares no Brasil tem 9 digitos; se vier com 8 e comecar com 6-9
    // provavelmente falta o "9" na frente.
    if (/^[6-9]/.test(subscriber)) {
      candidates.add(`55${ddd}9${subscriber}`);
    }
  } else {
    return [];
  }

  return Array.from(candidates);
}

function isPlausibleBrazilianNumber(rawValue) {
  return buildCandidates(rawValue).length > 0;
}

function toWhatsAppId(e164Digits) {
  return `${e164Digits}@c.us`;
}

module.exports = {
  onlyDigits,
  buildCandidates,
  isPlausibleBrazilianNumber,
  toWhatsAppId,
};
