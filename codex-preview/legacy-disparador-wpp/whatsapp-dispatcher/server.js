'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const config = require('./src/config');
const store = require('./src/store');
const logger = require('./src/logger');
const whatsappClient = require('./src/whatsappClient');
const campaignEngine = require('./src/campaignEngine');
const { parseContactsFile } = require('./src/excelParser');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Autenticacao basica do painel ----------
function basicAuth(req, res, next) {
  if (!config.DASHBOARD_PASSWORD) return next(); // sem senha configurada, libera (uso local)

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [user, password] = decoded.split(':');
    if (user === config.DASHBOARD_USER && password === config.DASHBOARD_PASSWORD) {
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="VIVAS ENVIA"');
  return res.status(401).send('Autenticacao necessaria.');
}

app.use(basicAuth);

const upload = multer({ dest: config.UPLOADS_DIR, limits: { fileSize: 15 * 1024 * 1024 } });

// ---------- WhatsApp ----------
whatsappClient.initClient();

app.get('/api/whatsapp/status', (_req, res) => {
  res.json({ status: whatsappClient.getStatus(), qr: whatsappClient.getQrDataUrl() });
});

app.post('/api/whatsapp/logout', async (_req, res) => {
  try {
    await whatsappClient.logout();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Upload de planilha ----------
app.post('/api/contacts/upload', upload.single('planilha'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  try {
    const contacts = parseContactsFile(req.file.path);
    store.replaceContacts(contacts);
    store.saveState({
      status: 'idle',
      sinceLastBatchPause: 0,
      nextBatchThreshold: 0,
      startedAt: null,
      totalSent: 0,
      totalFailed: 0,
    });

    const invalidCount = contacts.filter((c) => c.status === 'invalid').length;
    const skippedCount = contacts.filter((c) => c.status === 'skipped').length;
    logger.info(`Planilha importada: ${contacts.length} linhas.`, { invalidCount, skippedCount });

    res.json({ ok: true, total: contacts.length, invalidCount, skippedCount });
  } catch (err) {
    logger.error('Erro ao importar planilha.', { message: err.message });
    res.status(400).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/contacts', (_req, res) => {
  res.json(store.getContacts());
});

app.delete('/api/contacts', (_req, res) => {
  store.clearContacts();
  store.saveState({ status: 'idle', totalSent: 0, totalFailed: 0, startedAt: null });
  res.json({ ok: true });
});

// Baixa uma planilha modelo pronta para o usuario preencher.
app.get('/api/contacts/template', (_req, res) => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Nome', 'WhatsApp', 'Empreendimento de Interesse'],
    ['Maria Silva', '(11) 98888-7777', 'Residencial Vista Verde'],
    ['Joao Souza', '11977776666', ''],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatos');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="modelo-contatos.xlsx"');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.send(buffer);
});

// Exporta o relatorio final (status de cada contato) para conferencia.
app.get('/api/contacts/report', (_req, res) => {
  const contacts = store.getContacts();
  const rows = contacts.map((c) => ({
    Nome: c.nome,
    WhatsApp: c.phoneRaw,
    'Empreendimento de Interesse': c.empreendimento,
    Status: c.status,
    'Nome usado na mensagem': c.nomeUsado === false ? 'Nao (nome invalido)' : c.nomeUsado ? 'Sim' : '',
    Tentativas: c.attempts,
    'Enviado em': c.sentAt || '',
    Erro: c.error || '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatorio');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-disparo.xlsx"');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.send(buffer);
});

// ---------- Configuracoes ----------
app.get('/api/settings', (_req, res) => {
  res.json(store.getSettings());
});

app.put('/api/settings', (req, res) => {
  const allowedKeys = Object.keys(config.DEFAULT_SETTINGS);
  const patch = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }
  const saved = store.saveSettings(patch);
  logger.info('Configuracoes atualizadas.');
  res.json(saved);
});

// ---------- Campanha ----------
app.post('/api/campaign/start', (_req, res) => {
  try {
    res.json(campaignEngine.start());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/campaign/pause', (_req, res) => {
  res.json(campaignEngine.pause());
});

app.post('/api/campaign/stop', (_req, res) => {
  res.json(campaignEngine.stop());
});

app.get('/api/campaign/status', (_req, res) => {
  res.json(campaignEngine.summary());
});

// ---------- Log/status ao vivo (Server-Sent Events) ----------
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('log', { history: logger.getRecent(100) });
  send('status', campaignEngine.summary());

  const unsubscribeLog = logger.subscribe((entry) => send('log', { entry }));
  const unsubscribeStatus = whatsappClient.onStatusChange(() =>
    send('status', campaignEngine.summary())
  );
  const statusInterval = setInterval(() => send('status', campaignEngine.summary()), 5000);

  req.on('close', () => {
    unsubscribeLog();
    unsubscribeStatus();
    clearInterval(statusInterval);
  });
});

app.listen(config.PORT, () => {
  logger.info(`VIVAS ENVIA rodando em http://localhost:${config.PORT}`);
});
