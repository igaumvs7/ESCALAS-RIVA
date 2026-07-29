const CONFIG = {
  SPREADSHEET_ID: '12jTIthOgHc1GI7D6DdkyD_kqhtDC7-aaR12Pgn9_F40',
  SHEET_NAME: 'BANCO GERAL',
  FOLDER_ID: '1x5Fo5dsU9dWofGTQEiM3_3iXdotUnQoz'
};

function doGet() {
  return respostaJson_({
    ok: true,
    service: 'BANCO DE ESCALAS RIVA',
    message: 'Serviço disponível'
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) {
      throw new Error('O banco está ocupado. Aguarde alguns segundos e tente novamente.');
    }
    const conteudo = e && e.postData ? e.postData.contents : '';
    const dados = JSON.parse(conteudo || '{}');
    if (dados.action !== 'salvarEscala') {
      throw new Error('Ação inválida.');
    }
    return respostaJson_(salvarEscala_(dados));
  } catch (erro) {
    console.error(erro);
    return respostaJson_({ok: false, error: erro && erro.message ? erro.message : String(erro)});
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function salvarEscala_(dados) {
  validarDados_(dados);

  const planilha = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const aba = planilha.getSheetByName(CONFIG.SHEET_NAME);
  if (!aba) throw new Error('A aba BANCO GERAL não foi encontrada.');

  const pasta = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const id = String(dados.id).trim();
  const nome = sanitizarNome_(dados.nome);
  const sufixo = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || String(Date.now());
  const baseArquivo = (nome + ' - ' + sufixo).slice(0, 150);

  let arquivoPdf = null;
  let arquivoJson = null;
  try {
    const bytesPdf = Utilities.base64Decode(String(dados.pdfBase64));
    arquivoPdf = pasta.createFile(Utilities.newBlob(bytesPdf, 'application/pdf', baseArquivo + '.pdf'));
    arquivoJson = pasta.createFile(Utilities.newBlob(String(dados.jsonConteudo), 'application/json', baseArquivo + '.json'));

    const linhaExistente = localizarLinhaPorId_(aba, id);
    const linha = linhaExistente || Math.max(aba.getLastRow() + 1, 2);
    const linkPdfAntigo = linhaExistente ? linkDaCelula_(aba.getRange(linha, 11)) : '';
    const linkJsonAntigo = linhaExistente ? linkDaCelula_(aba.getRange(linha, 12)) : '';

    const ano = Number(dados.ano);
    const mes = Number(dados.mes);
    const dataInicial = dataDaEscala_(dados.dataInicial);
    const dataFinal = dataDaEscala_(dados.dataFinal);
    const geradoEm = new Date();

    aba.getRange(linha, 1, 1, 14).setValues([[
      id,
      nome,
      ano,
      mes,
      String(dados.mesNome || '').toUpperCase(),
      dataInicial,
      dataFinal,
      String(dados.regional || ''),
      String(dados.responsavel || ''),
      geradoEm,
      'ABRIR PDF',
      'ABRIR DADOS',
      String(dados.status || 'ATIVA'),
      String(dados.observacoes || '')
    ]]);

    aba.getRange(linha, 11).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('ABRIR PDF').setLinkUrl(arquivoPdf.getUrl()).build()
    );
    aba.getRange(linha, 12).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('ABRIR DADOS').setLinkUrl(arquivoJson.getUrl()).build()
    );
    SpreadsheetApp.flush();

    if (linkPdfAntigo && linkPdfAntigo !== arquivoPdf.getUrl()) moverParaLixeira_(linkPdfAntigo);
    if (linkJsonAntigo && linkJsonAntigo !== arquivoJson.getUrl()) moverParaLixeira_(linkJsonAntigo);

    return {
      ok: true,
      id: id,
      row: linha,
      pdfUrl: arquivoPdf.getUrl(),
      jsonUrl: arquivoJson.getUrl(),
      spreadsheetUrl: planilha.getUrl()
    };
  } catch (erro) {
    if (arquivoPdf) {
      try { arquivoPdf.setTrashed(true); } catch (_) {}
    }
    if (arquivoJson) {
      try { arquivoJson.setTrashed(true); } catch (_) {}
    }
    throw erro;
  }
}

function validarDados_(dados) {
  const obrigatorios = ['id', 'nome', 'ano', 'mes', 'dataInicial', 'dataFinal', 'pdfBase64', 'jsonConteudo'];
  obrigatorios.forEach(function(campo) {
    if (dados[campo] === undefined || dados[campo] === null || String(dados[campo]).trim() === '') {
      throw new Error('Campo obrigatório ausente: ' + campo);
    }
  });
  const ano = Number(dados.ano);
  const mes = Number(dados.mes);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new Error('Ano inválido.');
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('Mês inválido.');
  if (String(dados.pdfBase64).length > 36 * 1024 * 1024) throw new Error('PDF maior que o limite permitido.');
  JSON.parse(String(dados.jsonConteudo));
}

function localizarLinhaPorId_(aba, id) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return 0;
  const encontrada = aba.getRange(2, 1, ultimaLinha - 1, 1)
    .createTextFinder(id)
    .matchEntireCell(true)
    .findNext();
  return encontrada ? encontrada.getRow() : 0;
}

function dataDaEscala_(valor) {
  const partes = String(valor).split('-').map(Number);
  if (partes.length !== 3 || !partes[0] || !partes[1] || !partes[2]) {
    throw new Error('Data inválida: ' + valor);
  }
  return new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0);
}

function sanitizarNome_(nome) {
  const limpo = String(nome || 'Escala Riva')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (limpo || 'Escala Riva').slice(0, 120);
}

function linkDaCelula_(celula) {
  try {
    const rich = celula.getRichTextValue();
    if (rich && rich.getLinkUrl()) return rich.getLinkUrl();
  } catch (_) {}
  const valor = String(celula.getValue() || '');
  return /^https:\/\//.test(valor) ? valor : '';
}

function moverParaLixeira_(url) {
  try {
    const match = String(url).match(/[-\w]{25,}/);
    if (match) DriveApp.getFileById(match[0]).setTrashed(true);
  } catch (erro) {
    console.warn('Não foi possível arquivar a versão anterior:', erro);
  }
}

function respostaJson_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
