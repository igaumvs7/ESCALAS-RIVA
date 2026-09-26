'use strict';

const MAX_TEMPLATES = 5;

const numberFields = [
  'delayCurtoMinSeconds',
  'delayCurtoMaxSeconds',
  'delayMedioACadaMensagens',
  'delayMedioMinMinutes',
  'delayMedioMaxMinutes',
  'delayLongoACadaMensagens',
  'delayLongoMinMinutes',
  'delayLongoMaxMinutes',
  'dailyLimit',
  'workingHourStart',
  'workingHourEnd',
];

const checkboxFields = [
  'templateRotationEnabled',
  'nameValidationEnabled',
  'dailyLimitEnabled',
  'typingSimulationEnabled',
];

let templates = [''];

function $(id) {
  return document.getElementById(id);
}

function setWaBadge(status) {
  const el = $('wa-status');
  const map = {
    disconnected: ['Desconectado', 'badge-off'],
    qr: ['Aguardando QR', 'badge-qr'],
    authenticated: ['Autenticando...', 'badge-qr'],
    ready: ['Conectado', 'badge-on'],
  };
  const [label, cls] = map[status] || map.disconnected;
  el.textContent = label;
  el.className = `badge ${cls}`;
}

function renderCounts(el, counts) {
  el.innerHTML = Object.entries(counts)
    .map(([key, value]) => `<span>${key}: <b>${value}</b></span>`)
    .join('');
}

function appendLog(entry) {
  const box = $('log-box');
  const line = document.createElement('div');
  const time = new Date(entry.time).toLocaleTimeString('pt-BR');
  line.textContent = `[${time}] ${entry.message}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function renderTemplates() {
  const container = $('templates-list');
  container.innerHTML = '';
  templates.forEach((text, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'template-item';

    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.value = text;
    textarea.placeholder = `Variação ${index + 1}`;
    textarea.addEventListener('input', (e) => {
      templates[index] = e.target.value;
    });

    wrapper.appendChild(textarea);

    if (templates.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger small';
      removeBtn.textContent = 'Remover';
      removeBtn.addEventListener('click', () => {
        templates.splice(index, 1);
        renderTemplates();
      });
      wrapper.appendChild(removeBtn);
    }

    container.appendChild(wrapper);
  });

  $('btn-add-template').disabled = templates.length >= MAX_TEMPLATES;
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const settings = await res.json();

  templates = (settings.messageTemplates && settings.messageTemplates.length
    ? settings.messageTemplates
    : ['']
  ).slice(0, MAX_TEMPLATES);
  renderTemplates();

  for (const field of numberFields) {
    $(field).value = settings[field];
  }
  for (const field of checkboxFields) {
    $(field).checked = !!settings[field];
  }
}

async function saveSettings() {
  const payload = {
    messageTemplates: templates.map((t) => t.trim()).filter((t) => t),
  };
  for (const field of numberFields) {
    payload[field] = Number($(field).value);
  }
  for (const field of checkboxFields) {
    payload[field] = $(field).checked;
  }

  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const savedLabel = $('settings-saved');
  savedLabel.textContent = 'Salvo!';
  setTimeout(() => (savedLabel.textContent = ''), 2000);
}

function addTemplate() {
  if (templates.length >= MAX_TEMPLATES) return;
  templates.push('');
  renderTemplates();
}

async function uploadPlanilha(event) {
  event.preventDefault();
  const file = $('file-input').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('planilha', file);

  const resultEl = $('upload-result');
  resultEl.textContent = 'Importando...';

  const res = await fetch('/api/contacts/upload', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    resultEl.textContent = `Erro: ${data.error}`;
    return;
  }
  resultEl.textContent =
    `Importado: ${data.total} contatos ` +
    `(inválidos: ${data.invalidCount}, duplicados: ${data.skippedCount}).`;
  refreshStatus();
}

async function clearContacts() {
  if (!confirm('Isso apaga a lista de contatos importada. Continuar?')) return;
  await fetch('/api/contacts', { method: 'DELETE' });
  refreshStatus();
}

async function startCampaign() {
  $('campaign-error').textContent = '';
  const res = await fetch('/api/campaign/start', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) $('campaign-error').textContent = data.error;
}

async function pauseCampaign() {
  await fetch('/api/campaign/pause', { method: 'POST' });
}

async function stopCampaign() {
  if (!confirm('Isso encerra a campanha atual. Continuar?')) return;
  await fetch('/api/campaign/stop', { method: 'POST' });
}

async function logoutWhatsapp() {
  if (!confirm('Isso desconecta a sessão do WhatsApp (precisará escanear o QR de novo).')) return;
  await fetch('/api/whatsapp/logout', { method: 'POST' });
}

function refreshStatus() {
  fetch('/api/campaign/status')
    .then((res) => res.json())
    .then(applyStatus);
}

function applyStatus(data) {
  setWaBadge(data.whatsappStatus);
  renderCounts($('contact-counts'), data.counts);
  renderCounts($('campaign-counts'), { status: data.state.status, ...data.counts, hoje: data.state.sentToday });
}

function connectEvents() {
  const source = new EventSource('/api/events');

  source.addEventListener('log', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.history) payload.history.forEach(appendLog);
    if (payload.entry) appendLog(payload.entry);
  });

  source.addEventListener('status', (event) => {
    applyStatus(JSON.parse(event.data));
  });
}

async function refreshQr() {
  const res = await fetch('/api/whatsapp/status');
  const data = await res.json();
  setWaBadge(data.status);
  if (data.qr) {
    $('qr-img').src = data.qr;
    $('qr-img').style.display = 'block';
    $('qr-empty').style.display = 'none';
  } else {
    $('qr-img').style.display = 'none';
    $('qr-empty').style.display = data.status === 'ready' ? 'none' : 'block';
    $('qr-empty').textContent =
      data.status === 'ready' ? '' : 'Aguardando geração do QR code...';
  }
}

$('upload-form').addEventListener('submit', uploadPlanilha);
$('btn-clear-contacts').addEventListener('click', clearContacts);
$('btn-add-template').addEventListener('click', addTemplate);
$('btn-save-settings').addEventListener('click', saveSettings);
$('btn-start').addEventListener('click', startCampaign);
$('btn-pause').addEventListener('click', pauseCampaign);
$('btn-stop').addEventListener('click', stopCampaign);
$('btn-logout').addEventListener('click', logoutWhatsapp);

loadSettings();
refreshStatus();
refreshQr();
connectEvents();
setInterval(refreshQr, 4000);
