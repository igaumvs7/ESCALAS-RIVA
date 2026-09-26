'use strict';

function ts() {
  return new Date().toISOString();
}

module.exports = {
  info: (msg, meta) => console.log(`[${ts()}] INFO  ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[${ts()}] WARN  ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[${ts()}] ERROR ${msg}`, meta ?? ''),
  success: (msg, meta) => console.log(`[${ts()}] OK    ${msg}`, meta ?? ''),
};
