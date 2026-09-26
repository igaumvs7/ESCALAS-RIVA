'use strict';

const store = require('./store');
const logger = require('./logger');
const whatsappClient = require('./whatsappClient');
const { buildMessage } = require('./spintax');
const { isValidHumanName } = require('./nameValidator');

let loopRunning = false;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

/**
 * Dorme por `ms` milissegundos, mas verifica a cada segundo se a campanha
 * foi pausada/parada, retornando mais cedo nesse caso. Isso e o que faz um
 * "pausar" no painel ter efeito em segundos mesmo estando no meio de uma
 * pausa longa de 30 minutos, em vez de travar o botao.
 */
async function interruptibleSleep(ms) {
  const step = 1000;
  let elapsed = 0;
  while (elapsed < ms) {
    const state = store.getState();
    if (state.status !== 'running') return { interrupted: true };
    const chunk = Math.min(step, ms - elapsed);
    await new Promise((resolve) => setTimeout(resolve, chunk));
    elapsed += chunk;
  }
  return { interrupted: false };
}

function isWithinWorkingWindow(settings) {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const dayOk = settings.workingDays.includes(day);
  const hourOk = hour >= settings.workingHourStart && hour < settings.workingHourEnd;
  return dayOk && hourOk;
}

function msUntilNextWorkingWindow(settings) {
  const now = new Date();
  const probe = new Date(now);
  // avanca hora a hora ate achar uma janela valida (no maximo 8 dias pra
  // evitar loop infinito se a configuracao estiver toda desmarcada)
  for (let i = 0; i < 24 * 8; i++) {
    probe.setHours(probe.getHours() + 1, 0, 0, 0);
    if (settings.workingDays.includes(probe.getDay())) {
      const hour = probe.getHours();
      if (hour >= settings.workingHourStart && hour < settings.workingHourEnd) {
        return probe.getTime() - now.getTime();
      }
    }
  }
  return 60 * 60 * 1000; // fallback: tenta de novo em 1h
}

function pickThreshold(base, jitter) {
  return Math.max(1, base + randomInt(-jitter, jitter));
}

function getNextPendingContact() {
  const contacts = store.getContacts();
  return contacts.find((c) => c.status === 'pending') || null;
}

function summary() {
  const contacts = store.getContacts();
  const counts = { total: contacts.length, pending: 0, sent: 0, failed: 0, invalid: 0, skipped: 0 };
  for (const c of contacts) {
    if (counts[c.status] != null) counts[c.status] += 1;
  }
  return {
    counts,
    state: store.getState(),
    settings: store.getSettings(),
    whatsappStatus: whatsappClient.getStatus(),
  };
}

/**
 * Escolhe qual das (ate 5) variantes de mensagem usar neste envio.
 * Com rotacao ativada, gira sequencialmente entre as variantes cadastradas
 * (round-robin) para nao repetir sempre o mesmo texto. Com rotacao
 * desativada, sempre usa a primeira variante.
 */
function pickTemplate(settings, state) {
  const templates = (settings.messageTemplates || []).filter((t) => t && t.trim());
  if (templates.length === 0) {
    throw new Error('Nenhum modelo de mensagem cadastrado.');
  }
  if (!settings.templateRotationEnabled || templates.length === 1) {
    return { template: templates[0], index: 0 };
  }
  const nextIndex = (state.lastTemplateIndex + 1) % templates.length;
  return { template: templates[nextIndex], index: nextIndex };
}

async function sendToContact(contact, settings, template) {
  let whatsappId = contact.whatsappId;

  if (!whatsappId) {
    whatsappId = await whatsappClient.resolveWhatsAppId(contact.phoneCandidates);
    if (!whatsappId) {
      store.updateContact(contact.id, {
        status: 'invalid',
        error: 'Numero nao encontrado no WhatsApp',
      });
      logger.warn(`Numero invalido/nao encontrado no WhatsApp: ${contact.nome}`, {
        phone: contact.phoneRaw,
      });
      return { sent: false, invalid: true };
    }
  }

  const nomeValido = !settings.nameValidationEnabled || isValidHumanName(contact.nome);
  const message = buildMessage(template, contact, nomeValido ? contact.nome : '');
  const maxAttempts = Math.max(1, settings.retryMaxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await whatsappClient.sendMessageHuman(whatsappId, message, settings);
      store.updateContact(contact.id, {
        status: 'sent',
        whatsappId,
        attempts: attempt,
        error: null,
        nomeUsado: nomeValido,
        sentAt: new Date().toISOString(),
      });
      logger.success(`Mensagem enviada para ${contact.nome}`, {
        phone: contact.phoneRaw,
        nomePersonalizado: nomeValido,
      });
      return { sent: true };
    } catch (err) {
      logger.warn(`Falha ao enviar para ${contact.nome} (tentativa ${attempt}/${maxAttempts})`, {
        error: err.message,
      });
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, settings.retryBackoffBaseMs * attempt)
        );
      } else {
        store.updateContact(contact.id, {
          status: 'failed',
          whatsappId,
          attempts: attempt,
          error: err.message,
        });
        return { sent: false };
      }
    }
  }
  return { sent: false };
}

async function runLoop() {
  if (loopRunning) return;
  loopRunning = true;
  logger.info('Motor de disparo iniciado.');

  try {
    while (true) {
      const state = store.getState();
      if (state.status !== 'running') break;

      if (!whatsappClient.isReady()) {
        store.saveState({ status: 'paused' });
        logger.error('WhatsApp nao esta conectado. Campanha pausada automaticamente.');
        break;
      }

      const settings = store.getSettings();
      store.resetDailyCounterIfNeeded();
      const freshState = store.getState();

      if (!isWithinWorkingWindow(settings)) {
        const waitMs = msUntilNextWorkingWindow(settings);
        logger.info('Fora do horario permitido. Aguardando proxima janela de disparo.', {
          waitMinutes: Math.round(waitMs / 60000),
        });
        const { interrupted } = await interruptibleSleep(waitMs);
        if (interrupted) break;
        continue;
      }

      if (settings.dailyLimitEnabled && freshState.sentToday >= settings.dailyLimit) {
        logger.info('Limite diario de mensagens atingido. Aguardando proximo dia.');
        const { interrupted } = await interruptibleSleep(msUntilNextWorkingWindow(settings));
        if (interrupted) break;
        continue;
      }

      // Delay tipo 3 (longo) tem prioridade sobre o tipo 2 (medio): se os
      // dois ciclos vencerem juntos, so a pausa longa acontece (ela ja
      // engloba o descanso do ciclo medio).
      if (freshState.sinceDelayLongo >= freshState.nextDelayLongoThreshold) {
        const pauseMinutes = randomBetween(settings.delayLongoMinMinutes, settings.delayLongoMaxMinutes);
        logger.info(
          `Delay longo (tipo 3): descansando ${pauseMinutes.toFixed(1)} min. Pausa maior, ` +
            'imita uma parada real (ex: almoco) e protege o numero no longo prazo.'
        );
        store.saveState({
          sinceDelayLongo: 0,
          nextDelayLongoThreshold: pickThreshold(
            settings.delayLongoACadaMensagens,
            settings.delayLongoACadaMensagensJitter
          ),
          sinceDelayMedio: 0,
          nextDelayMedioThreshold: pickThreshold(
            settings.delayMedioACadaMensagens,
            settings.delayMedioACadaMensagensJitter
          ),
        });
        const { interrupted } = await interruptibleSleep(pauseMinutes * 60 * 1000);
        if (interrupted) break;
        continue;
      }

      if (freshState.sinceDelayMedio >= freshState.nextDelayMedioThreshold) {
        const pauseMinutes = randomBetween(settings.delayMedioMinMinutes, settings.delayMedioMaxMinutes);
        logger.info(
          `Delay medio (tipo 2): descansando ${pauseMinutes.toFixed(1)} min antes de continuar.`
        );
        store.saveState({
          sinceDelayMedio: 0,
          nextDelayMedioThreshold: pickThreshold(
            settings.delayMedioACadaMensagens,
            settings.delayMedioACadaMensagensJitter
          ),
        });
        const { interrupted } = await interruptibleSleep(pauseMinutes * 60 * 1000);
        if (interrupted) break;
        continue;
      }

      const contact = getNextPendingContact();
      if (!contact) {
        logger.success('Campanha concluida: nao ha mais contatos pendentes.');
        store.saveState({ status: 'idle' });
        break;
      }

      const { template, index: templateIndex } = pickTemplate(settings, freshState);
      const result = await sendToContact(contact, settings, template);

      if (result.sent) {
        store.saveState({
          sentToday: freshState.sentToday + 1,
          sinceDelayMedio: freshState.sinceDelayMedio + 1,
          sinceDelayLongo: freshState.sinceDelayLongo + 1,
          totalSent: freshState.totalSent + 1,
          lastTemplateIndex: templateIndex,
        });
      } else if (!result.invalid) {
        store.saveState({ totalFailed: freshState.totalFailed + 1, lastError: contact.error });
      }

      // Delay tipo 1 (curto): sempre acontece entre uma mensagem e outra.
      const delaySeconds = randomBetween(settings.delayCurtoMinSeconds, settings.delayCurtoMaxSeconds);
      const { interrupted } = await interruptibleSleep(delaySeconds * 1000);
      if (interrupted) break;
    }
  } catch (err) {
    logger.error('Erro inesperado no motor de disparo. Campanha pausada.', { message: err.message });
    store.saveState({ status: 'paused', lastError: err.message });
  } finally {
    loopRunning = false;
    logger.info('Motor de disparo parado.');
  }
}

function start() {
  const contacts = store.getContacts();
  if (contacts.length === 0) {
    throw new Error('Nenhum contato carregado. Envie uma planilha antes de iniciar.');
  }
  if (!whatsappClient.isReady()) {
    throw new Error('WhatsApp ainda nao esta conectado. Escaneie o QR code primeiro.');
  }

  const settings = store.getSettings();
  if (!(settings.messageTemplates || []).some((t) => t && t.trim())) {
    throw new Error('Cadastre pelo menos um modelo de mensagem antes de iniciar.');
  }

  const state = store.getState();
  const patch = { status: 'running' };
  if (!state.startedAt) patch.startedAt = new Date().toISOString();
  if (!state.nextDelayMedioThreshold) {
    patch.nextDelayMedioThreshold = pickThreshold(
      settings.delayMedioACadaMensagens,
      settings.delayMedioACadaMensagensJitter
    );
  }
  if (!state.nextDelayLongoThreshold) {
    patch.nextDelayLongoThreshold = pickThreshold(
      settings.delayLongoACadaMensagens,
      settings.delayLongoACadaMensagensJitter
    );
  }
  store.resetDailyCounterIfNeeded();
  store.saveState(patch);

  if (!loopRunning) {
    runLoop();
  }
  logger.info('Campanha iniciada/retomada.');
  return summary();
}

function pause() {
  store.saveState({ status: 'paused' });
  logger.info('Campanha pausada pelo usuario.');
  return summary();
}

function stop() {
  store.saveState({ status: 'stopped' });
  logger.info('Campanha interrompida pelo usuario.');
  return summary();
}

module.exports = { start, pause, stop, summary };
