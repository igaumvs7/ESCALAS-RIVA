'use strict';

require('dotenv').config();

const path = require('node:path');
const { getSupabase } = require('./src/supabase');
const sessionManager = require('./src/sessionManager');
const campaignWorker = require('./src/campaignWorker');
const { sendPendingOneToOne } = require('./src/oneToOne');
const logger = require('./src/logger');
const badMacRecovery = require('./src/badMacRecovery');

// Instalado ANTES de qualquer sessão Baileys subir -- ver badMacRecovery.js
// pro porquê (bug real: sessão de contato específico ficava presa em loop
// de "Bad MAC" mesmo sem nenhum restart do worker envolvido).
badMacRecovery.install(path.join(__dirname, '.baileys_auth'));

const SESSION_SYNC_INTERVAL_MS = 15_000;
const CAMPAIGN_TICK_INTERVAL_MS = 5_000;
// Mais rápido que campanha em massa: resposta 1:1 (operador/IA) deve parecer
// uma conversa normal, não precisa do ritmo do motor anti-bloqueio.
const ONE_TO_ONE_TICK_INTERVAL_MS = 3_000;

const supabase = getSupabase();

let syncRunning = false;

// A existência de uma linha em webjs_sessions É o sinal de "essa org quer o
// canal grátis ativo". Sobe sessão pra quem ativou, derruba quem desativou.
async function syncSessions() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const { data: sessions, error } = await supabase
      .from('webjs_sessions')
      .select('org_id, status, blocked_until');
    if (error) {
      logger.error('Falha ao listar webjs_sessions', { message: error.message });
      return;
    }

    const now = Date.now();
    // Org bloqueada e dentro da janela de 24h: NÃO reconecta ainda —
    // reconectar logo depois de um bloqueio pareceria mais suspeito pro
    // WhatsApp. Só volta a tentar quando blocked_until passar.
    const isWaitingOutBlock = (s) =>
      s.status === 'blocked' && s.blocked_until && new Date(s.blocked_until).getTime() > now;

    const desired = new Set((sessions ?? []).filter((s) => !isWaitingOutBlock(s)).map((s) => s.org_id));
    const active = new Set(sessionManager.activeOrgIds());

    for (const orgId of desired) {
      if (!active.has(orgId)) {
        await sessionManager.startSession(supabase, orgId);
      }
    }
    for (const orgId of active) {
      if (!desired.has(orgId)) {
        await sessionManager.stopSession(orgId);
      }
    }
  } finally {
    syncRunning = false;
  }
}

async function main() {
  logger.info('VIVAS ENVIA (webjs worker) iniciando...');
  await syncSessions();
  setInterval(() => void syncSessions(), SESSION_SYNC_INTERVAL_MS);
  setInterval(() => void campaignWorker.tick(supabase), CAMPAIGN_TICK_INTERVAL_MS);
  setInterval(() => void sendPendingOneToOne(supabase), ONE_TO_ONE_TICK_INTERVAL_MS);
  logger.success('Worker no ar — sincronizando sessões a cada 15s, campanhas a cada 5s, respostas 1:1 a cada 3s.');
}

main().catch((err) => {
  logger.error('Erro fatal ao iniciar', { message: err.message });
  process.exit(1);
});

// Desligamento educado: fecha as conexões sem apagar a sessão salva, pra
// reconectar sozinho na próxima subida (deploy, restart do PM2, etc.) sem
// pedir escanear QR de novo. PM2 manda SIGTERM e espera um pouco antes de
// forçar — por isso não damos process.exit(0) na hora, deixamos as conexões
// fecharem primeiro.
async function gracefulShutdown(signal) {
  logger.info(`${signal} recebido, encerrando com cuidado...`);
  await sessionManager.shutdownAll(supabase);
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
