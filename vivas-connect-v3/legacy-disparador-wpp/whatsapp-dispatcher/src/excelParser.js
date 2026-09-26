'use strict';

const XLSX = require('xlsx');
const crypto = require('crypto');
const { buildCandidates } = require('./phone');

// Aceita variacoes comuns de nome de coluna que aparecem em planilhas reais.
const HEADER_ALIASES = {
  nome: ['nome', 'name', 'cliente', 'lead'],
  telefone: ['whatsapp', 'telefone', 'celular', 'numero', 'phone', 'fone', 'contato'],
  empreendimento: [
    'empreendimento',
    'empreendimento de interesse',
    'interesse',
    'imovel',
    'imovel de interesse',
    'produto',
  ],
};

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos
}

function findColumnKey(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Le um arquivo .xlsx/.xls/.csv de contatos e retorna a lista normalizada,
 * ja validando numeros e removendo duplicados. Nao lanca excecao por linha
 * invalida: marca a linha como invalida no proprio registro para o usuario
 * ver no relatorio o que precisa corrigir.
 */
function parseContactsFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error('A planilha esta vazia.');
  }

  const headers = Object.keys(rows[0]);
  const nomeKey = findColumnKey(headers, HEADER_ALIASES.nome);
  const telefoneKey = findColumnKey(headers, HEADER_ALIASES.telefone);
  const empreendimentoKey = findColumnKey(headers, HEADER_ALIASES.empreendimento);

  if (!telefoneKey) {
    throw new Error(
      'Nao encontrei a coluna de WhatsApp/telefone. Use um cabecalho como ' +
        '"WhatsApp", "Telefone" ou "Celular".'
    );
  }

  const seenPhones = new Set();
  const contacts = [];

  rows.forEach((row, index) => {
    const nome = nomeKey ? String(row[nomeKey]).trim() : '';
    const empreendimento = empreendimentoKey ? String(row[empreendimentoKey]).trim() : '';
    const phoneRaw = String(row[telefoneKey]).trim();

    if (!phoneRaw) return; // linha em branco, ignora silenciosamente

    const candidates = buildCandidates(phoneRaw);
    const isValid = candidates.length > 0;
    const primaryDigits = isValid ? candidates[0] : null;

    let status = 'pending';
    let error = null;

    if (!isValid) {
      status = 'invalid';
      error = 'Numero de telefone nao reconhecido';
    } else if (seenPhones.has(primaryDigits)) {
      status = 'skipped';
      error = 'Numero duplicado na planilha';
    }

    if (isValid) seenPhones.add(primaryDigits);

    contacts.push({
      id: crypto.randomUUID(),
      rowNumber: index + 2, // +2 = cabecalho + index base 0
      nome: nome || 'cliente',
      empreendimento,
      phoneRaw,
      phoneCandidates: candidates,
      whatsappId: null, // resolvido no momento do envio via getNumberId
      status,
      attempts: 0,
      error,
      sentAt: null,
    });
  });

  return contacts;
}

module.exports = { parseContactsFile, HEADER_ALIASES };
