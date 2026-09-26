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
 * Insere um caractere invisivel (zero-width space, U+200B) depois de ~15%
 * das palavras (no minimo 1, no maximo 6), em posicoes aleatorias. Serve pra
 * cobrir o caso em que o template NAO tem spintax ({a|b}) nenhum -- sem
 * isso, uma campanha com texto fixo manda a mensagem byte-a-byte identica
 * pra todo mundo, que e o sinal mais simples de disparo em massa pra
 * qualquer sistema de deteccao. O ZWSP nao aparece pro destinatario (nao
 * afeta a leitura), so muda a sequencia de bytes de mensagem pra mensagem.
 * Nao mexe em delay/limite de envio -- so no conteudo do texto.
 */
// Um grupo spintax de verdade tem `|` dentro: `{a|b}`. A variavel numerada
// `{{1}}` NAO casa (nao tem `|`), entao template com variavel mas sem
// variacao continua recebendo o ruido invisivel, como deve.
const TEM_VARIACAO_REAL = /\{[^{}]*\|[^{}]*\}/;

function addZeroWidthNoise(text) {
  const ZWSP = String.fromCharCode(0x200b); // zero-width space -- invisivel, nao usar literal cru no fonte
  const words = text.split(' ');
  if (words.length < 3) return text;
  const qty = Math.max(1, Math.min(6, Math.floor(words.length * 0.15)));
  const positions = new Set();
  while (positions.size < qty) {
    positions.add(Math.floor(Math.random() * (words.length - 1)));
  }
  return words.map((word, i) => (positions.has(i) ? word + ZWSP : word)).join(' ');
}

/**
 * Monta a mensagem final para um contato especifico: primeiro preenche
 * os dados do contato, depois resolve a variacao de texto (spintax), depois
 * o ruido invisivel (addZeroWidthNoise).
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
  const cleaned = message
    .replace(/[ \t]{2,}/g, ' ') // espacos duplicados quando um campo fica vazio
    .replace(/ +,/g, ',') // ", " sobrando quando o nome fica vazio (ex: "Ola , tudo bem")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // BUG REAL (2026-09-12): o comentario de addZeroWidthNoise sempre disse que
  // ela existe "pra cobrir o caso em que o template NAO tem spintax nenhum" --
  // mas o codigo aplicava SEMPRE, inclusive quando o dono ja tinha escrito as
  // 5 variacoes na tela de template (MessageVariantsEditor -> `{a|b|c}`).
  //
  // Isso era o pior dos dois mundos: a mensagem ja estava variando de verdade
  // (texto diferente por pessoa, sorteado), e ainda levava por cima um
  // caractere invisivel -- que e padrao conhecido de evasao e NAO aparece em
  // mensagem de gente normal. Ou seja, chamava atencao sem precisar.
  //
  // Agora o ruido invisivel so entra quando nao ha variacao real nenhuma, que
  // e exatamente o caso que ele foi feito pra cobrir (decisao do dono,
  // 2026-09-12: "caso a pessoa utilize apenas 1 tipo de texto temos que
  // utilizar esses espacos invisiveis").
  return TEM_VARIACAO_REAL.test(template) ? cleaned : addZeroWidthNoise(cleaned);
}

module.exports = { resolveSpintax, fillPlaceholders, buildMessage, addZeroWidthNoise };
