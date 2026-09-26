'use strict';

/**
 * Resolve variaveis {{nome}} / {{empreendimento}} e spintax {opcao1|opcao2}
 * no template de mensagem. O spintax existe para que a mesma campanha nao
 * mande o texto 100% identico pra todo mundo, o que ajuda a reduzir o
 * "fingerprint" de mensagem em massa.
 *
 * Exemplo de template:
 *   "Oi {{nome}}, {Tudo bem?|Como vai?} Vi que voce se interessou pelo
 *   {{empreendimento}}. Posso te passar mais detalhes?"
 */

function resolveSpintax(text) {
  const spintaxRegex = /\{([^{}]+)\}/;
  let result = text;
  // repete ate nao sobrar mais grupo {a|b|c} (permite grupos aninhados simples)
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (_match, group) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}

function fillPlaceholders(text, data) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    const value = data[key];
    return value == null || value === '' ? '' : String(value);
  });
}

/**
 * Monta a mensagem final para um contato especifico: primeiro preenche
 * os dados do contato, depois resolve a variacao de texto (spintax).
 *
 * `nomeParaUsar` e o nome ja decidido por quem chama (pode ser vazio, se a
 * validacao de nome tiver marcado o valor da planilha como invalido) - essa
 * funcao nao faz a validacao, so monta o texto final.
 */
function buildMessage(template, contact, nomeParaUsar) {
  const nome = nomeParaUsar != null ? nomeParaUsar : contact.nome || '';
  const withPlaceholders = fillPlaceholders(template, {
    nome,
    empreendimento: contact.empreendimento || '',
  });
  const message = resolveSpintax(withPlaceholders);
  return message
    .replace(/[ \t]{2,}/g, ' ') // espacos duplicados quando um campo fica vazio
    .replace(/ +,/g, ',') // ", " sobrando quando o nome fica vazio (ex: "Ola , tudo bem")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { resolveSpintax, fillPlaceholders, buildMessage };
