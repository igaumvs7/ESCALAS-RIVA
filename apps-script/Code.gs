// 2026-09-13 (pedido do dono): agora o sistema tambem gera escalas da
// DIRECIONAL (DV), alem da RIVA (RV). Mesma planilha BANCO GERAL pra nao
// precisar mexer no Google de novo, mas cada empresa tem sua PROPRIA pasta
// no Drive (isolamento real dos arquivos) e cada linha da planilha ganha
// uma coluna EMPRESA pra nunca confundir na hora de olhar o historico.
const CONFIG = {
  SPREADSHEET_ID: '12jTIthOgHc1GI7D6DdkyD_kqhtDC7-aaR12Pgn9_F40',
  SHEET_NAME: 'BANCO GERAL',
  FOLDER_ID_RIVA: '1x5Fo5dsU9dWofGTQEiM3_3iXdotUnQoz',
  FOLDER_ID_DIRECIONAL: '1p_YWF-DHbcB_IaCi_avnGf1GUHHN26V1'
};

// dados.empresa vem do sistema ('RIVA' ou 'DIRECIONAL'). Payload antigo (de
// antes desse campo existir) nao manda esse campo -- cai em RIVA, que e o
// comportamento de sempre, sem quebrar nada que ja estava salvo.
function pastaDaEmpresa_(empresa) {
  const nome = String(empresa || 'RIVA').toUpperCase();
  const id = nome === 'DIRECIONAL' ? CONFIG.FOLDER_ID_DIRECIONAL : CONFIG.FOLDER_ID_RIVA;
  return DriveApp.getFolderById(id);
}

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
    if (dados.action === 'salvarEscala') {
      return respostaJson_(salvarEscala_(dados));
    }
    if (dados.action === 'listarEscalas') {
      // Não precisa de lock — leitura não muda nada, e a trava de 30s do
      // salvarEscala ficaria esperando à toa (2026-09-12: histórico
      // persistente entre máquinas, pedido do dono).
      lock.releaseLock();
      return respostaJson_(listarEscalas_());
    }
    if (dados.action === 'obterEscalaJson') {
      lock.releaseLock();
      return respostaJson_(obterEscalaJson_(dados.id));
    }
    throw new Error('Ação inválida.');
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

  const pasta = pastaDaEmpresa_(dados.empresa);
  const empresa = String(dados.empresa || 'RIVA').toUpperCase();
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

    aba.getRange(linha, 1, 1, 15).setValues([[
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
      String(dados.observacoes || ''),
      empresa
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

// Histórico persistente entre máquinas (2026-09-12): lê a aba BANCO GERAL
// inteira e devolve todas as escalas já enviadas ao banco, mais recente
// primeiro. É só leitura — nunca muda a planilha.
function listarEscalas_() {
  const planilha = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const aba = planilha.getSheetByName(CONFIG.SHEET_NAME);
  if (!aba) throw new Error('A aba BANCO GERAL não foi encontrada.');

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { ok: true, escalas: [] };

  const dados = aba.getRange(2, 1, ultimaLinha - 1, 15).getValues();
  const escalas = [];
  for (let i = 0; i < dados.length; i++) {
    const linha = i + 2;
    const row = dados[i];
    if (!row[0]) continue; // linha vazia no meio da planilha
    escalas.push({
      id: String(row[0]),
      nome: String(row[1] || ''),
      ano: Number(row[2]) || null,
      mes: Number(row[3]) || null,
      mesNome: String(row[4] || ''),
      dataInicial: formatarDataIso_(row[5]),
      dataFinal: formatarDataIso_(row[6]),
      regional: String(row[7] || ''),
      responsavel: String(row[8] || ''),
      geradoEm: row[9] instanceof Date ? row[9].toISOString() : String(row[9] || ''),
      pdfUrl: linkDaCelula_(aba.getRange(linha, 11)),
      jsonUrl: linkDaCelula_(aba.getRange(linha, 12)),
      status: String(row[12] || ''),
      observacoes: String(row[13] || ''),
      // Coluna 15 (índice 14) só existe em linhas gravadas a partir de
      // 2026-09-13 — linhas antigas (só RIVA, de antes da Direcional
      // existir) ficam com célula vazia aqui, então caem em 'RIVA' por
      // padrão, que é o que elas realmente são.
      empresa: String(row[14] || 'RIVA').toUpperCase()
    });
  }
  // Mais recente primeiro — geradoEm é o que reflete "quando foi enviado/atualizado".
  escalas.sort(function (a, b) { return (b.geradoEm || '').localeCompare(a.geradoEm || ''); });
  return { ok: true, escalas: escalas };
}

// Busca o conteúdo completo (escala + locais + gerentes) do JSON já salvo no
// Drive pra uma escala específica — usado quando o dono clica "Importar pra
// editar aqui" numa escala que só existe no banco (não neste navegador).
// Lido pelo próprio Apps Script (DriveApp), não por fetch direto do
// navegador, porque o link do Drive não devolve JSON puro sem passar por
// tela de consentimento.
function obterEscalaJson_(id) {
  if (!id) throw new Error('id é obrigatório.');
  const resultado = listarEscalas_();
  const entrada = resultado.escalas.find(function (e) { return e.id === String(id); });
  if (!entrada) throw new Error('Escala não encontrada no banco.');
  if (!entrada.jsonUrl) throw new Error('Esta escala não tem arquivo de dados salvo.');

  const match = String(entrada.jsonUrl).match(/[-\w]{25,}/);
  if (!match) throw new Error('Não foi possível identificar o arquivo no Drive.');
  const arquivo = DriveApp.getFileById(match[0]);
  const conteudo = arquivo.getBlob().getDataAsString('UTF-8');
  return { ok: true, id: id, conteudo: conteudo };
}

function formatarDataIso_(valor) {
  if (!(valor instanceof Date)) return String(valor || '');
  const ano = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  const dia = String(valor.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
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
