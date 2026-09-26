'use strict';

const fs = require('fs');
const path = require('path');

// Carrega .env manualmente (sem dependencia extra). Formato simples KEY=VALUE.
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const AUTH_DIR = path.join(__dirname, '..', '.wwebjs_auth');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  PORT: Number(process.env.PORT || 3333),
  DASHBOARD_USER: process.env.DASHBOARD_USER || 'admin',
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || '',
  CHROME_PATH: process.env.CHROME_PATH || '',
  DATA_DIR,
  UPLOADS_DIR,
  AUTH_DIR,
  CONTACTS_FILE: path.join(DATA_DIR, 'contacts.json'),
  SETTINGS_FILE: path.join(DATA_DIR, 'settings.json'),
  STATE_FILE: path.join(DATA_DIR, 'state.json'),
  LOG_FILE: path.join(DATA_DIR, 'activity.log'),

  // Configuracoes padrao do motor anti-bloqueio. Todas ajustaveis pelo
  // painel e salvas em settings.json. Os tempos padrao seguem o racional
  // documentado no README (secao "Estudo dos tempos seguros"): 3 niveis de
  // delay que se alternam, imitando pausas humanas em escalas diferentes.
  DEFAULT_SETTINGS: {
    // Ate 5 variantes de mensagem, alternadas entre os envios para nao
    // repetir sempre o mesmo texto (reduz "fingerprint" de disparo em massa).
    messageTemplates: [
      'Ola {{nome}}, tudo bem? Aqui e da equipe de vendas. Vi seu interesse ' +
        'no empreendimento {{empreendimento}} e {gostaria|queria} saber se ' +
        'posso te passar mais informacoes. Pode me responder por aqui, ok?',
    ],
    templateRotationEnabled: true,

    // Deteccao de nome invalido na planilha (numero, texto aleatorio, etc.)
    // para nao personalizar a mensagem com um nome que nao faz sentido.
    nameValidationEnabled: true,

    // Delay tipo 1 (curto): aplicado entre TODA mensagem enviada.
    delayCurtoMinSeconds: 35,
    delayCurtoMaxSeconds: 80,

    // Delay tipo 2 (medio): uma pausa curta a cada N mensagens.
    delayMedioACadaMensagens: 8,
    delayMedioACadaMensagensJitter: 2,
    delayMedioMinMinutes: 4,
    delayMedioMaxMinutes: 9,

    // Delay tipo 3 (longo): uma pausa maior a cada N mensagens (ciclo maior
    // que o do delay medio).
    delayLongoACadaMensagens: 30,
    delayLongoACadaMensagensJitter: 5,
    delayLongoMinMinutes: 20,
    delayLongoMaxMinutes: 35,

    dailyLimitEnabled: true,
    dailyLimit: 150,

    workingHourStart: 8,
    workingHourEnd: 20,
    workingDays: [1, 2, 3, 4, 5, 6], // 0=domingo ... 6=sabado

    typingSimulationEnabled: true,
    minTypingMs: 1500,
    maxTypingMs: 6000,

    retryMaxAttempts: 2,
    retryBackoffBaseMs: 8000,
  },
};
