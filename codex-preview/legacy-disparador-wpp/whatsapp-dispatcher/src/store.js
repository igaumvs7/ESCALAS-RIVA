'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Store simples baseado em arquivos JSON, com escrita atomica (grava em
 * arquivo temporario e renomeia) para nunca deixar o arquivo corrompido se
 * o processo cair no meio de uma escrita. Isso e o que garante que, se o
 * servidor reiniciar no meio de uma campanha, ao voltar ele sabe
 * exatamente quem ja recebeu mensagem e quem ainda esta pendente.
 */

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

// ---------- Settings ----------

function getSettings() {
  const saved = readJsonSafe(config.SETTINGS_FILE, {});
  return { ...config.DEFAULT_SETTINGS, ...saved };
}

function saveSettings(partial) {
  const current = getSettings();
  const merged = { ...current, ...partial };
  writeJsonAtomic(config.SETTINGS_FILE, merged);
  return merged;
}

// ---------- Contacts ----------
// cada contato: { id, nome, empreendimento, phoneRaw, whatsappId, status,
//                 attempts, error, sentAt }
// status: 'pending' | 'sent' | 'failed' | 'invalid' | 'skipped'

function getContacts() {
  return readJsonSafe(config.CONTACTS_FILE, []);
}

function saveContacts(contacts) {
  writeJsonAtomic(config.CONTACTS_FILE, contacts);
  return contacts;
}

function updateContact(id, patch) {
  const contacts = getContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  contacts[idx] = { ...contacts[idx], ...patch };
  saveContacts(contacts);
  return contacts[idx];
}

function replaceContacts(newContacts) {
  saveContacts(newContacts);
}

function clearContacts() {
  saveContacts([]);
}

// ---------- Campaign run state ----------
// status: 'idle' | 'running' | 'paused' | 'stopped'

const DEFAULT_STATE = {
  status: 'idle',
  sentToday: 0,
  dateKey: '',
  sinceDelayMedio: 0,
  nextDelayMedioThreshold: 0,
  sinceDelayLongo: 0,
  nextDelayLongoThreshold: 0,
  lastTemplateIndex: -1,
  pausedUntil: null,
  lastError: null,
  totalSent: 0,
  totalFailed: 0,
  startedAt: null,
};

function getState() {
  return { ...DEFAULT_STATE, ...readJsonSafe(config.STATE_FILE, {}) };
}

function saveState(partial) {
  const current = getState();
  const merged = { ...current, ...partial };
  writeJsonAtomic(config.STATE_FILE, merged);
  return merged;
}

function resetDailyCounterIfNeeded() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const state = getState();
  if (state.dateKey !== todayKey) {
    return saveState({ dateKey: todayKey, sentToday: 0 });
  }
  return state;
}

module.exports = {
  readJsonSafe,
  writeJsonAtomic,
  getSettings,
  saveSettings,
  getContacts,
  saveContacts,
  updateContact,
  replaceContacts,
  clearContacts,
  getState,
  saveState,
  resetDailyCounterIfNeeded,
};
