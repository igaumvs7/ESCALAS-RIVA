# Guia de Instalação — VIVAS CONNECT

Self-hosted: **VIVAS CONNECT** — CRM de WhatsApp com IA pra corretores de
imóveis (e outros autônomos que atendem cliente pelo WhatsApp).

> **O que é.** Disparo em massa no WhatsApp (Vivas Envia), agente de IA com
> RAG respondendo automaticamente, inbox com handoff IA ↔ humano, site
> público do corretor (Vivas Perfil) e dashboard de leads. Multi-tenant:
> uma instância atende várias organizações isoladas, com cadastro
> self-serve e billing via Pix (Mercado Pago).
>
> **Stack.** React 18 + Vite + Tailwind + shadcn · Supabase (Postgres, Auth,
> Realtime, Edge Functions, Storage, pgvector, pg_cron) · WhatsApp via
> **webjs (Baileys)** — QR code, sem API paga — rodando num worker à parte
> numa VPS · Deploy Vercel.

---

## 0. Pré-requisitos

- **Node 20+** e **npm**
- Uma conta **Supabase** (1 projeto por instalação)
- Uma conta **Vercel** (deploy do frontend + API Routes)
- Uma **VPS própria** (ex.: Hetzner) pra rodar o `webjs-worker/` — é o que
  mantém a conexão real do WhatsApp (não roda na Vercel, que é serverless
  e não segura uma conexão de longa duração). Ver `webjs-worker/README.md`.
- Chave de **LLM** (OpenAI obrigatória p/ embeddings/Whisper; Claude/Gemini
  opcionais)
- Conta **Mercado Pago** se for usar o billing self-serve (Pix)

---

## 1. Caminho rápido (recomendado)

1. Clone o repositório:
   ```bash
   git clone <repo> meu-crm && cd meu-crm
   npm install
   ```
2. Importe o projeto na **Vercel** e faça o primeiro deploy.
3. Abra a URL publicada e siga o wizard em **`/setup`** — ele coleta as
   credenciais core (Supabase, Vercel, owner), roda as migrations, deploya
   as Edge Functions e grava as envs. Ao terminar, você já cai logado como
   admin da organização.
4. **WhatsApp não é configurado no wizard.** Depois de logado, vá em
   **VIVAS Envia** dentro do CRM — ali aparece o QR code assim que o
   `webjs-worker/` estiver rodando numa VPS conectada ao mesmo Supabase
   (ver seção 3).

---

## 2. Caminho manual / desenvolvimento

Use quando for desenvolver, ou instalar sem o wizard.

### 2.1. Banco de dados

Toda a estrutura vive no schema **`whatsapp_hub`** e está versionada em
`supabase/migrations/`. Aplique tudo via Management API (só precisa de um
**Personal Access Token** do Supabase — sem senha de banco):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx
export PROJECT_REF=<ref-do-projeto>
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
export APP_ENCRYPTION_KEY=<segredo-32-chars>

npm run db:push
```

O script `scripts/push-migrations.mjs` aplica cada migration em ordem e
registra o que já rodou (idempotente).

> Alternativa oficial: `supabase db push` (Supabase CLI) — requer a senha
> do banco. O `npm run db:push` evita isso usando o PAT.

### 2.2. Edge Functions

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx
export PROJECT_REF=<ref>
npm run functions:deploy
```

### 2.3. Variáveis de ambiente (core)

Apenas **quatro** envs core existem em produção (preenchidas pelo wizard ou
manualmente na Vercel / `.env.local`):

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRYPTO_KEY=                # NÃO apague: decifra as credenciais em public.app_settings
```

As credenciais de aplicação (OpenAI, Claude, Gemini) **não** ficam em
`.env`: são configuradas dentro do CRM logado, em **Configurações → Agente
de IA**, e guardadas criptografadas em `public.org_settings`. O Mercado
Pago é diferente: `MERCADOPAGO_ACCESS_TOKEN` é um secret de instância (não
por org), configurado como env na Vercel/Supabase.

### 2.4. Rodar local

```bash
npm run dev          # http://localhost:5173
npm run validate:sql # valida todas as migrations (parse)
```

Pra apontar o frontend a um Supabase real em dev, informe a URL + anon key
no wizard `/setup` (persistidas em localStorage) ou nas envs `VITE_`.

### 2.5. WhatsApp (webjs-worker)

O canal de WhatsApp **não é uma API paga** — é uma conexão direta via
Baileys, que precisa de um processo rodando 24h fora da Vercel/Supabase.
Ver `webjs-worker/README.md` pro passo a passo completo (instalação numa
VPS, PM2, backup da pasta de sessão). Resumo:

```bash
cd webjs-worker
npm install
cp .env.example .env   # preenche SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
pm2 start index.js --name vivas-webjs-worker
pm2 save && pm2 startup
```

Cada organização ativa seu próprio número em **VIVAS Envia** dentro do CRM
(escaneando um QR code) — não tem credencial nenhuma pra configurar aqui.

---

## 3. Primeiro acesso

- O **primeiro usuário** que se cadastrar numa organização nova vira
  **admin** automaticamente (trigger `handle_new_user`).
- Admin controla templates, campanhas, base de conhecimento da IA, equipe
  e configurações.
- Operator opera o inbox e os contatos no dia a dia.

---

## 4. White-label / branding

Personalize por cliente sem tocar na lógica:

| O quê | Onde |
|---|---|
| Nome da ferramenta | `setup.config.ts` (`toolName`) |
| Tokens de cor / temas (dark glassmorphism) | `src/styles/globals.css` (variáveis `--accent-primary`, etc., um bloco por tema) |
| Logo e imagens de marca | `public/logo-*.png` |

> O schema permanece `whatsapp_hub` (não renomear — o código todo
> referencia `.schema('whatsapp_hub')`).

---

## 5. Verificação pós-instalação

1. `/setup` concluído sem erros, login criando o admin.
2. **VIVAS Envia** mostra o QR code (confirma que o `webjs-worker` está
   rodando e conectado ao mesmo Supabase).
3. Escaneia o QR com um WhatsApp de teste, manda uma mensagem pra esse
   número e confirma que ela chega no **Inbox**.
4. **Vivas Perfil** abre a página pública do corretor (`/c/<slug>`).
5. Dashboard mostra as métricas de lead (mesmo que zeradas, sem erro).

---

## 6. O que NÃO existe mais (histórico)

Pra quem consultar uma versão antiga deste guia ou do código: os itens
abaixo foram removidos de propósito, não são bug se você não achar:

- **Zernio e UAZAPI** (APIs pagas de WhatsApp) — descontinuadas por completo
  em 2026-08-22. WhatsApp hoje é só via webjs/Baileys (QR code, grátis).
- **Funil comercial (deals/pipelines com valor em R$)** — removido da UI em
  2026-08-22 (produto é sobre leads, não sobre funil de vendas). As tabelas
  no banco continuam existindo com dado histórico, sem tela nova.
- **`/settings/credentials`** — a rota existe mas hoje só redireciona pra
  `/settings/profile`; não existe mais uma aba dedicada de credenciais.
