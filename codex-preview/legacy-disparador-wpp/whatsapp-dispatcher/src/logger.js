'use strict';

const fs = require('fs');
const config = require('./config');

const MAX_MEMORY_LOGS = 500;
const memoryLogs = [];
const listeners = new Set();

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  const entry = { time: timestamp(), level, message, extra: extra || null };
  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_MEMORY_LOGS) memoryLogs.shift();

  const line = `[${entry.time}] [${level.toUpperCase()}] ${message}${
    extra ? ' ' + JSON.stringify(extra) : ''
  }\n`;
  fs.appendFile(config.LOG_FILE, line, () => {});

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch (_err) {
      // nunca deixa um listener quebrado derrubar o logger
    }
  }
  return entry;
}

module.exports = {
  info: (message, extra) => log('info', message, extra),
  warn: (message, extra) => log('warn', message, extra),
  error: (message, extra) => log('error', message, extra),
  success: (message, extra) => log('success', message, extra),
  getRecent: (limit = 200) => memoryLogs.slice(-limit),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
