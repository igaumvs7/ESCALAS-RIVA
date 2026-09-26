'use strict';

const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');

// Auto-recuperação de sessão Signal quebrada ("Bad MAC" em loop) -- bug real
// de produção (2026-09-03/04): mesmo depois de reconectar do zero (QR novo),
// a sessão de um contato específico voltava a travar sozinha, sem nenhum
// restart do worker envolvido -- então "esperar o restart parar de acontecer"
// não resolvia. O WhatsApp já tenta se autocurar (Baileys refaz a sessão a
// partir de um prekey bundle novo a cada falha), mas isso pode ficar preso
// num loop indefinido pro MESMO contato. `libsignal` (dependência interna do
// Baileys) loga esse erro via `console.error` cru -- não existe evento
// estruturado do Baileys pra isso (verificado no código-fonte da lib antes
// de escrever isso). Por isso a detecção aqui intercepta `console.error`
// diretamente: é o único lugar onde esse sinal existe de verdade.
//
// Ação corretiva: depois de N falhas pro MESMO identificador numa janela
// curta, apaga (move pra backup, nunca deleta de vez) os arquivos de sessão
// desse contato em TODAS as orgs ativas -- força o Baileys a negociar uma
// sessão 100% nova no próximo contato, sem precisar de SSH manual.

const FAILURE_WINDOW_MS = 2 * 60 * 1000; // 2 minutos
const FAILURE_THRESHOLD = 2; // 2 "Bad MAC" pro mesmo identificador dispara o reset
const RESET_COOLDOWN_MS = 5 * 60 * 1000; // não reseta o MESMO identificador 2x em <5min

const failureTimestamps = new Map(); // identity -> [timestamps]
const lastResetAt = new Map(); // identity -> timestamp

// Extrai o identificador (JID sem o índice de dispositivo) do texto de erro.
// Formato real observado em produção: "at async 154795352555738.0 [as awaitable]"
// -- pode ter 1+ índices de dispositivo (.0, .81, .82...) pro mesmo contato.
function extractIdentity(text) {
  const m = /\bat async (\d{5,})\.\d+ \[as awaitable\]/.exec(text);
  return m ? m[1] : null;
}

function serializeArgs(args) {
  try {
    return args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message || String(a);
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
  } catch {
    return '';
  }
}

function pruneOld(list, now) {
  while (list.length > 0 && now - list[0] > FAILURE_WINDOW_MS) list.shift();
}

// Varre TODAS as orgs (não sabemos por qual org a falha chegou -- o log cru
// não carrega esse dado) e move os arquivos de sessão do identificador pra
// uma pasta de backup, nunca apaga de vez.
function resetIdentitySessions(baseAuthDir, identity) {
  let totalMoved = 0;
  let orgsTouched = [];
  let orgDirs;
  try {
    orgDirs = fs.readdirSync(baseAuthDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (err) {
    logger.error('badMacRecovery: falha ao listar orgs pra reset de sessão', { message: err.message });
    return { totalMoved: 0, orgsTouched: [] };
  }

  for (const orgDir of orgDirs) {
    const orgId = orgDir.name;
    const dir = path.join(baseAuthDir, orgId);
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.startsWith(`session-${identity}.`));
    } catch {
      continue; // pasta some no meio do caminho (org desconectada agora) -- ok, ignora
    }
    if (files.length === 0) continue;

    const backupDir = path.join(baseAuthDir, '..', '.baileys_auth_badmac_backup', orgId);
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch (err) {
      logger.error('badMacRecovery: falha ao criar pasta de backup', { orgId, message: err.message });
      continue;
    }

    for (const f of files) {
      try {
        fs.renameSync(path.join(dir, f), path.join(backupDir, `${Date.now()}-${f}`));
        totalMoved++;
      } catch (err) {
        // Um arquivo específico pode falhar (permissão, race de escrita
        // concorrente) sem impedir os outros -- cada arquivo é independente.
        logger.error('badMacRecovery: falha ao mover arquivo de sessão', {
          orgId,
          file: f,
          message: err.message,
        });
      }
    }
    if (files.length > 0) orgsTouched.push(orgId);
  }

  return { totalMoved, orgsTouched };
}

function handlePotentialBadMac(text, baseAuthDir) {
  if (!text.includes('Bad MAC')) return;
  const identity = extractIdentity(text);
  if (!identity) return; // não conseguiu extrair -- não faz nada às cegas

  const now = Date.now();
  const list = failureTimestamps.get(identity) ?? [];
  list.push(now);
  pruneOld(list, now);
  failureTimestamps.set(identity, list);

  if (list.length < FAILURE_THRESHOLD) return;

  const lastReset = lastResetAt.get(identity) ?? 0;
  if (now - lastReset < RESET_COOLDOWN_MS) return; // já resetou recente, evita loop de reset

  lastResetAt.set(identity, now);
  failureTimestamps.set(identity, []); // zera a contagem depois de agir

  const { totalMoved, orgsTouched } = resetIdentitySessions(baseAuthDir, identity);
  if (totalMoved > 0) {
    logger.warn('badMacRecovery: sessão Signal em loop de Bad MAC -- resetada automaticamente', {
      identity,
      filesMoved: totalMoved,
      orgs: orgsTouched.join(','),
    });
  } else {
    logger.warn('badMacRecovery: detectado loop de Bad MAC mas nenhum arquivo de sessão encontrado', {
      identity,
    });
  }
}

// Chamar UMA VEZ no início do processo (index.js) -- console.error é global,
// não faz sentido re-patchear por sessão/org.
function install(baseAuthDir) {
  const originalError = console.error;
  console.error = (...args) => {
    originalError(...args);
    // Nunca deixa a detecção quebrar o log real -- roda depois, isolado.
    try {
      handlePotentialBadMac(serializeArgs(args), baseAuthDir);
    } catch (err) {
      originalError('badMacRecovery: erro interno (ignorado)', err?.message);
    }
  };
  logger.info('badMacRecovery: monitoramento de sessão Signal ativo');
}

module.exports = { install, extractIdentity, handlePotentialBadMac, resetIdentitySessions };
