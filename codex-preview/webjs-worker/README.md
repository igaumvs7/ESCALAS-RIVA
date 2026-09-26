# VIVAS ENVIA — worker do canal grátis (Baileys)

Serviço separado do resto do VIVAS CONNECT. Roda fora da Vercel/Supabase —
precisa de um **servidor ligado 24h** (VPS), porque mantém sessões reais do
WhatsApp conectadas (uma por corretor que ativar o canal grátis).

## Por que precisa de VPS (e não dá pra rodar na Vercel)

A Vercel roda funções serverless com tempo de execução curto e sem estado —
não dá pra manter uma conexão de WhatsApp aberta por dias. Isso exige um
processo que fica rodando o tempo todo, o que é exatamente o que um VPS
oferece.

## Por que Baileys (não `whatsapp-web.js`)

A primeira versão desse worker usava `whatsapp-web.js`, que abre um Chrome
headless por sessão conectada (~400MB de RAM cada). Baileys conecta direto
por WebSocket, sem navegador nenhum — **medido de verdade** neste projeto:
~15MB de RAM a mais por sessão conectada. Isso muda a conta de capacidade
por completo:

| | `whatsapp-web.js` (v1) | Baileys (atual) |
|---|---|---|
| RAM por sessão | ~400MB | ~15-20MB (medido) |
| Sessões num VPS de 2GB | ~4-5 | ~60-80 |
| Precisa de Chrome/Chromium | Sim | Não |
| Vulnerabilidades no `npm install` | 5 altas | 0 |

## Requisitos do servidor

- Node.js 18+
- Nada mais — sem Chrome, sem Chromium, sem Puppeteer

## Instalação

```bash
cd webjs-worker
npm install
cp .env.example .env
```

Edita o `.env`:

```bash
SUPABASE_URL=https://glopoibilsntmzegtnne.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<pega no Supabase: Configurações do projeto > API Keys > service_role>
```

(A variável `CHROME_PATH` do `.env.example` antigo não existe mais — Baileys
não usa navegador.)

## Rodando

```bash
npm start
```

Pra produção de verdade, roda com um gerenciador de processo que reinicia
sozinho se cair (ex.: PM2):

```bash
npm install -g pm2
pm2 start index.js --name vivas-webjs-worker
pm2 save
pm2 startup   # configura pra subir sozinho quando o servidor reiniciar
```

## Como funciona

1. O corretor clica em "Ativar disparador grátis" no painel (Configurações →
   VIVAS Envia) — isso cria uma linha em `whatsapp_hub.webjs_sessions`.
2. O worker verifica essa tabela a cada 15s. Linha nova = sobe uma sessão
   Baileys pra essa organização, gera o QR code e salva na mesma linha
   (`qr_data_url`) — o painel do corretor mostra esse QR em tempo real.
3. Corretor escaneia com o celular → sessão fica `ready`, o worker grava o
   número conectado e cria/atualiza o canal (`whatsapp_hub.channels`,
   `provider = 'webjs'`).
4. A cada 5s, o worker confere se alguma organização com sessão pronta tem
   campanha (`status = 'sending'`) apontando pro canal `webjs`, e dispara UMA
   mensagem por vez, respeitando o motor anti-bloqueio (delay curto a cada
   mensagem, médio a cada ~8, longo a cada ~30, limite diário, janela de
   horário comercial) — mesma lógica do Disparador-WPP original.
5. Se a organização estiver com assinatura bloqueada (pagamento atrasado),
   o worker **não dispara nada** pra ela, mesmo com a sessão conectada.
6. Se a conexão cair por queda de rede/instabilidade, o worker **reconecta
   sozinho** (5s de espera, mesma sessão salva) — o corretor não precisa
   escanear QR de novo, só se ele mesmo desconectar pelo celular ("sair do
   WhatsApp Web").
7. Se o servidor reiniciar (deploy, atualização, queda), as sessões voltam
   sozinhas ao ligar de novo — as credenciais ficam salvas em disco
   (`.baileys_auth/`), não é apagado num reinício normal.
8. Desativar (botão "Desconectar" no painel) apaga a linha de
   `webjs_sessions` — o worker detecta isso e aí sim encerra a sessão de
   vez, apagando a credencial salva.

## Robustez implementada (não é só o "caminho feliz")

- Reconexão automática com backoff simples (5s) quando a conexão cai por
  motivo diferente de logout manual.
- Trava contra duas sessões concorrentes da mesma organização (o sync
  periódico e o timer de reconexão não brigam entre si).
- Trava contra o "tick" de campanhas se sobrepor (a simulação de digitação
  sozinha pode levar até 6s, mais rede — sem a trava, duas checagens
  concorrentes poderiam processar a mesma org ao mesmo tempo).
- Desligamento educado (`SIGTERM`/`SIGINT`): fecha as conexões sem apagar a
  sessão salva, pra reconectar rápido na próxima subida.

## Limitações conhecidas (v1)

- Delays/limite diário ainda não são configuráveis por organização — usa
  valores fixos conservadores (iguais ao Disparador-WPP original).
- Mensagens enviadas por esse canal ainda não aparecem no Inbox/histórico de
  conversa (só o status da campanha é atualizado). Isso é um próximo passo
  natural, não bloqueia o disparo funcionar.
- Se o worker reiniciar, o estado do motor anti-bloqueio (contadores de
  delay médio/longo) reseta — não afeta o limite diário nem o histórico, só
  o "ritmo" de pausas recomeça do zero.
- Existe uma janela de corrida muito estreita (milissegundos) entre o
  sincronizador periódico e o timer de reconexão que, em teoria, poderia
  criar duas sessões Baileys por uma fração de segundo pra mesma org antes
  de uma delas ser descartada. Baixo risco na prática, mas documentado —
  próximo passo seria um lock explícito se isso aparecer em produção.
