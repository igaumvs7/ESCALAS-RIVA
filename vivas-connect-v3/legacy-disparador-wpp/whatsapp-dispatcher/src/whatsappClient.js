'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const config = require('./config');
const logger = require('./logger');

let client = null;
let latestQrDataUrl = null;
let connectionStatus = 'disconnected'; // disconnected | qr | authenticated | ready
const statusListeners = new Set();

function setStatus(status) {
  connectionStatus = status;
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch (_err) {
      /* ignore */
    }
  }
}

function buildPuppeteerOptions() {
  const options = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (config.CHROME_PATH) {
    options.executablePath = config.CHROME_PATH;
  }
  return options;
}

function initClient() {
  if (client) return client;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.AUTH_DIR }),
    puppeteer: buildPuppeteerOptions(),
  });

  client.on('qr', async (qr) => {
    setStatus('qr');
    latestQrDataUrl = await QRCode.toDataURL(qr);
    logger.info('QR code gerado. Escaneie no painel para conectar o WhatsApp.');
  });

  client.on('authenticated', () => {
    setStatus('authenticated');
    latestQrDataUrl = null;
    logger.info('WhatsApp autenticado.');
  });

  client.on('ready', () => {
    setStatus('ready');
    logger.success('WhatsApp conectado e pronto para disparar.');
  });

  client.on('auth_failure', (message) => {
    setStatus('disconnected');
    logger.error('Falha na autenticacao do WhatsApp.', { message });
  });

  client.on('disconnected', (reason) => {
    setStatus('disconnected');
    logger.error(
      'WhatsApp desconectado. Se a campanha estava rodando, ela sera pausada ' +
        'automaticamente.',
      { reason }
    );
  });

  client.initialize().catch((err) => {
    logger.error('Erro ao inicializar o cliente do WhatsApp.', { message: err.message });
  });

  return client;
}

function getStatus() {
  return connectionStatus;
}

function getQrDataUrl() {
  return latestQrDataUrl;
}

function onStatusChange(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function isReady() {
  return connectionStatus === 'ready';
}

/**
 * Descobre qual das variantes de numero (com/sem 9o digito) esta
 * efetivamente registrada no WhatsApp. Retorna null se nenhuma existir -
 * nesse caso NUNCA se deve tentar enviar, pois mandar para numero
 * inexistente so gera erro e desperdica uma tentativa que conta como
 * atividade suspeita.
 */
async function resolveWhatsAppId(candidates) {
  if (!client) throw new Error('Cliente do WhatsApp nao inicializado.');
  for (const digits of candidates) {
    try {
      const result = await client.getNumberId(digits);
      if (result && result._serialized) {
        return result._serialized;
      }
    } catch (_err) {
      // tenta o proximo candidato
    }
  }
  return null;
}

/**
 * Envia uma mensagem simulando digitacao humana antes do envio. O tempo
 * de "digitacao" e proporcional ao tamanho do texto, dentro de limites
 * configurados, o que evita o padrao robotico de "mensagem aparece
 * instantaneamente".
 */
async function sendMessageHuman(whatsappId, text, settings) {
  const chat = await client.getChatById(whatsappId);

  if (settings.typingSimulationEnabled) {
    const perCharMs = 45; // ritmo aproximado de digitacao humana
    const raw = Math.min(
      settings.maxTypingMs,
      Math.max(settings.minTypingMs, text.length * perCharMs)
    );
    const typingMs = Math.round(raw * (0.8 + Math.random() * 0.4)); // jitter +-20%
    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, typingMs));
  }

  return client.sendMessage(whatsappId, text);
}

async function logout() {
  if (!client) return;
  await client.logout();
  setStatus('disconnected');
}

module.exports = {
  initClient,
  getStatus,
  getQrDataUrl,
  onStatusChange,
  isReady,
  resolveWhatsAppId,
  sendMessageHuman,
  logout,
};
