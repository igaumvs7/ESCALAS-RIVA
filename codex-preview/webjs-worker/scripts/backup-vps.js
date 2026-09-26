'use strict';

// ----------------------------------------------------------------------------
// Backup diário da sessão do WhatsApp (.baileys_auth) + .env do worker.
// Se a VPS perder o disco, o dado que realmente não tem como recriar é a
// sessão do Baileys (sem ela, todo corretor precisa escanear o QR de novo) e
// o .env (chaves/segredos que não ficam no git). Código do worker em si já
// está no GitHub -- não precisa backup, um `git clone` recria.
//
// Roda via cron (ver instruções no fim do arquivo). Sobe pro mesmo projeto
// Supabase que o resto do sistema já usa (bucket privado
// whatsapp-hub-vps-backups, sem policy pública nenhuma -- só service role
// escreve/lê), sem custo de infraestrutura extra. Mantém só os últimos 7
// backups (apaga o resto) pra não crescer sem limite.
// ----------------------------------------------------------------------------

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const WORKER_DIR = path.join(__dirname, '..');
const BUCKET = 'whatsapp-hub-vps-backups';
const KEEP_LAST = 7;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env');

  const authDir = path.join(WORKER_DIR, '.baileys_auth');
  if (!fs.existsSync(authDir)) {
    console.log('[backup] .baileys_auth não existe ainda (nenhuma sessão conectada) -- nada pra fazer backup.');
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const tarName = `backup-${stamp}.tar.gz`;
  const tarPath = path.join('/tmp', tarName);

  // Compacta .baileys_auth inteiro + .env (se existir), relativo ao WORKER_DIR
  // pra não vazar o caminho absoluto do servidor dentro do arquivo.
  const envArg = fs.existsSync(path.join(WORKER_DIR, '.env')) ? '.env' : '';
  execSync(`tar -czf "${tarPath}" -C "${WORKER_DIR}" .baileys_auth ${envArg}`.trim(), { stdio: 'inherit' });

  const buffer = fs.readFileSync(tarPath);
  const supabase = createClient(url, key);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(tarName, buffer, { contentType: 'application/gzip', upsert: true });
  if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);
  console.log(`[backup] Enviado: ${tarName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  fs.unlinkSync(tarPath);

  // Limpeza: mantém só os KEEP_LAST mais recentes.
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (listError) throw new Error(`Listagem falhou: ${listError.message}`);
  const backups = (files ?? [])
    .filter((f) => f.name.startsWith('backup-') && f.name.endsWith('.tar.gz'))
    .sort((a, b) => b.name.localeCompare(a.name)); // mais recente primeiro (nome = data)

  const toDelete = backups.slice(KEEP_LAST).map((f) => f.name);
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove(toDelete);
    if (deleteError) throw new Error(`Limpeza falhou: ${deleteError.message}`);
    console.log(`[backup] Removidos ${toDelete.length} backup(s) antigo(s):`, toDelete.join(', '));
  }

  console.log(`[backup] OK -- ${Math.min(backups.length, KEEP_LAST)} backup(s) mantido(s).`);
}

main().catch((err) => {
  console.error('[backup] ERRO:', err.message);
  process.exit(1);
});

// ----------------------------------------------------------------------------
// Setup (rodar uma vez na VPS, como o usuário `vivas`):
//
//   crontab -e
//
// Adicionar a linha (roda todo dia às 5h da manhã, log em arquivo próprio):
//
//   0 5 * * * cd /home/vivas/vivas-connect/webjs-worker && node scripts/backup-vps.js >> /home/vivas/backup.log 2>&1
//
// Testar manualmente antes de confiar no cron:
//
//   cd /home/vivas/vivas-connect/webjs-worker && node scripts/backup-vps.js
// ----------------------------------------------------------------------------
