# CLAUDE.md — VIVAS CONNECT

> ⚠️ Se este arquivo conflitar com `STATUS.md` na raiz do repo, `STATUS.md`
> vence — é o registro vivo de decisões e mudanças recentes. Esta reescrita
> (2026-08-24) já incorpora tudo que estava documentado lá até essa data.

## Visão geral

Plataforma multi-tenant de automação WhatsApp para corretores de imóveis
(marca **VIVAS**; o disparador em massa é vendido como **VIVAS ENVIA**, o
perfil público do corretor como **VIVAS PERFIL**). Uma instância atende
**múltiplas organizações totalmente isoladas** (multi-tenant, migrações
`20260810*_mt_*`): criação de templates assistida por IA, disparos em massa
via VIVAS ENVIA (Baileys), agente de IA com RAG, inbox em tempo real com
handoff IA ↔ humano, dashboard de **leads** (não de vendas/R$), perfil
público do corretor (`agent_sites`, migração `20260819150000`).

**Produto é sobre LEADS, não sobre um funil de vendas em R$.** O núcleo é o
disparo em massa (VIVAS ENVIA) e o VIVAS Perfil como porta de entrada,
com a IA conversando com quem responde. Não existe mais tela de
Funil/negócios com valor em R$ — foi removida de propósito (decisão do
dono, ver `STATUS.md`). O dashboard mede contagem de lead (enviados,
responderam, IA aguardando, transferido, qualificado, venda concluída),
não faturamento.

## Canal de WhatsApp: só webjs (Baileys) — decisão definitiva

**Existe um único canal, `provider: 'webjs'`.** Zernio (API oficial paga,
intermediário pra Meta Cloud API) e UAZAPI (outra API não-oficial paga)
foram avaliados e **descontinuados por completo em 2026-08-22** — decisão
de negócio, não técnica: exigiriam cada corretor pagar/gerenciar sua
própria credencial, inviável pro modelo de assinatura fixa da VIVAS. Não é
uma opção em aberto para reconsiderar sem uma conversa de produto nova.

- **Motor**: `webjs-worker/` — processo Node.js separado (JavaScript puro,
  não TS) rodando Baileys (`makeWASocket`), fora da Vercel/Supabase porque
  precisa de processo persistente. Roda numa VPS própria.
  - `sessionManager.js` — abre/mantém a sessão (QR code), detecta bloqueio
    (ver seção própria abaixo) e reconecta.
  - `inbound.js` — mensagens recebidas → grava em `messages`/`conversations`,
    dispara `process-ai-message` quando a IA deve responder.
  - `oneToOne.js` — envio 1:1 (operador ou IA respondendo).
  - `campaignWorker.js` — disparo em massa. Motor anti-bloqueio próprio:
    delay em 3 níveis (curto 35-80s; médio ~8 msgs a cada 4-9min; longo ~30
    msgs a cada 20-35min), limite diário (150 normal, reduzido durante
    recuperação de bloqueio), horário comercial (8h-20h seg-sáb), simulação
    de digitação, validação de nome, spintax. Ported do dispatcher original
    do dono (`legacy-disparador-wpp/`, referência histórica, não executado).
- **Conexão**: QR code direto na tela VIVAS Envia (`WebjsSettings.tsx`) —
  **sem API key pra configurar**. Isso é uma diferença importante vs. o
  modelo antigo Zernio/UAZAPI: `useMissingCredentials.ts` só cobra a chave
  da OpenAI, nunca uma chave de WhatsApp.
- **Sem janela de 24h**: essa regra é exclusiva da API oficial da Meta.
  Baileys não tem esse limite — o inbox mostra "Sem janela (WhatsApp)"
  sempre. Instagram (canal separado, API oficial da Meta) continua com
  janela de 24h real.
- **Sem mídia ainda**: envio/recebimento de imagem, áudio, vídeo, documento
  não tem implementação webjs (só existia via Zernio/UAZAPI, removida).
  `MessageInput.tsx` só manda texto + nota privada. `media_url` em
  mensagens hoje só aparece em linhas históricas do modelo antigo.
- **Sem aprovação de template**: no modelo Zernio, um template ia pra
  aprovação da Meta (`status: draft→pending→approved/rejected`) antes de
  poder ser usado numa campanha. Isso não existe mais — `templates` é só
  texto pronto de campanha (nome, idioma, corpo, variáveis). As colunas
  `category`/`status`/`meta_template_id`/`meta_template_status`/
  `header_type`/`header_content`/`footer`/`buttons` continuam na tabela
  (histórico, sem migração de dado) mas a UI (`TemplateFormDialog.tsx`,
  `TemplatesList.tsx`, `CampaignWizard.tsx`) não usa mais — cria com
  valores neutros fixos e ignora status ao listar template pra campanha.

### Detecção de bloqueio (24h) + recuperação de confiança do chip

O WhatsApp bloqueia temporariamente (24h) números com comportamento de
disparo suspeito. O sistema precisa **reconhecer isso e parar** (não ficar
tentando enviar até falhar pra todo mundo) e, depois que passa, **reconstruir
a confiança aos poucos** em vez de voltar direto no ritmo normal.

- **Detecção automática**: SÓ o código de desconexão `403` (forbidden) do
  Baileys, via `BLOCK_STATUS_CODES` em `sessionManager.js` — é o único
  código com consenso real da comunidade Baileys como sinal de restrição de
  spam. **Não confiar na categoria `fatal`/`rate-limited` de
  `classifyDisconnect()` da lib `baileys-antiban` pra decidir bloqueio** —
  3 misclassificações reais confirmadas em produção no mesmo dia
  (2026-08-27): código `515` (`restartRequired`, sinal normal pós-QR) e
  código `428` (`connectionClosed`, corte de conexão banal) caíam como
  'fatal' junto com logout de verdade, e a lib ainda mistura a MENSAGEM de
  `428` com a de `440` (`connectionReplaced`), retornando "Connection
  replaced — another device took over" pra uma simples queda de rede. Ver
  `sessionManager.js` pro comentário completo. `classifyDisconnect` ainda é
  chamada, só que unicamente pelo `backoffMs` sugerido pra reconexão —
  nunca mais pra decidir SE é bloqueio.
  Camada secundária, mais confiável (agrega vários sinais num score):
  `campaignWorker.js::checkAntibanRisk` consulta
  `sock.antiban.getStats().health.risk` a cada envio e marca bloqueio se
  virar high/critical — é essa camada que pega o código `463` (só aparece
  em erro de ENVIO, nunca em desconexão) e reforça o `403`.
- **Botão manual "Fui bloqueado"** (`webjs-report-block` Edge Function) —
  fallback pra quando a detecção automática não pegar (o sinal do Baileys
  não é garantido a 100%). Usa a mesma regra da automática
  (`whatsapp_hub.mark_webjs_blocked` RPC), nunca uma versão divergente.
- **Recuperação escalonada** (`mark_webjs_blocked`): calcula `blocked_until`
  (+24h) e uma janela de recuperação que piora conforme quantas vezes esse
  chip já bloqueou — 1ª vez: 5 dias / 40 msgs-dia; 2ª: 8 dias / 25; 3ª ou
  mais: 14 dias / 15. `campaignWorker.js::getEffectiveDailyLimit` respeita
  isso automaticamente e dobra o delay curto durante a recuperação.
  `index.js` (sync de sessões) não reconecta a org bloqueada antes das 24h
  passarem.
- **`baileys-antiban`** (lib de terceiros, MIT, npm): embrulha o socket
  (`wrapSocket(rawSock, 'conservative')`) com uma camada extra de
  jitter/aquecimento/digitação humana **por baixo** do motor próprio (reforça,
  não substitui). Estado de aquecimento (`exportWarmUpState`) persiste em
  `webjs_sessions.antiban_warmup_state` — sem isso, reiniciar o worker
  faria a lib "esquecer" que o número já estava aquecido.
- **Limitação conhecida**: nem a detecção da lib nem a nossa foi testada
  contra um bloqueio real de produção (não dá pra provocar de propósito
  sem arriscar um número real) — o botão manual existe por causa dessa
  incerteza inerente, não por falha de implementação.

## Cadastro público e billing (VIVAS, migração `20260819160000`)

- **Cadastro self-serve**: `/auth/signup` cria uma **organização nova por
  corretor** (metadata `signup_new_org=true` + `org_name` no
  `supabase.auth.signUp`). `handle_new_user` ganhou esse 3º caso — o corretor
  vira `admin` da própria org, nunca `is_super_admin`. Os dois casos antigos
  (bootstrap da instância e convite pra org existente) continuam intactos.
- **`whatsapp_hub.subscriptions`** (1 linha por org, só pra orgs nascidas do
  signup self-serve — orgs de bootstrap/convite não ganham linha e ficam
  isentas do gate, de propósito, pra não trancar o próprio dono fora da
  plataforma): `status` (`pending_first_payment → active ⇄ grace_period →
  blocked`), `plan_price_cents` (padrão 5999 = R$59,99), `current_period_end`,
  `grace_period_end`. `whatsapp_hub.subscription_payments` é o ledger
  (idempotente por `mp_payment_id`).
- **Modelo de cobrança: Pix avulso, não é o produto "Assinatura" do MP** (que é
  orientado a cartão). Cada ciclo gera um QR nôvo; sem débito automático — o
  corretor paga manualmente todo mês. `MERCADOPAGO_ACCESS_TOKEN` é secret **da
  plataforma** (uma conta MP recebe de todas as orgs), lido via `Deno.env` nas
  Edge Functions — não é per-org, não fica em `org_settings`. Credencial hoje
  é de **TESTE** mesmo em produção (troca pra produção é decisão deliberada,
  só quando o fluxo estiver 100% validado — ver `STATUS.md`).
- **Edge Functions**: `create-pix-charge` (autenticado, gera/reaproveita QR),
  `mercadopago-webhook` (público, `verify_jwt=false` — NUNCA confia no corpo
  do webhook, sempre rebusca o pagamento na API do MP pelo id antes de marcar
  como pago).
- **Ciclo de vida**: `whatsapp_hub.process_subscription_lifecycle()` roda
  1×/dia via pg_cron (job `subscription-lifecycle`) — `active` vencido vira
  `grace_period` (+2 dias úteis, `_add_business_days`), `grace_period` vencido
  vira `blocked`.
- **Guard no frontend**: `RequireActiveSubscription`
  (`src/app/components/billing/SubscriptionGate.tsx`) envolve `<AppLayout />`
  no router. `pending_first_payment`/`blocked` = tela cheia sem acesso;
  `grace_period` ou `active` a ≤2 dias do vencimento = banner com Pix inline,
  sem bloquear.
- **1 sessão ativa por conta**: `AuthProvider.signIn`/`signUp` chamam
  `supabase.auth.signOut({ scope: 'others' })` logo após autenticar — login
  novo derruba qualquer sessão antiga do mesmo usuário (evita duas pessoas
  logadas com a mesma conta ao mesmo tempo).

> Para o passo a passo de instalação pelo wizard `/setup`, consultar `README.md`. O `CLAUDE.md` foca
> em *como o código está organizado* e nas regras a respeitar ao alterá-lo.

## Multi-tenancy (organizações)

- **`whatsapp_hub.organizations`** (`id, name, slug, status active|archived`).
  TODAS as tabelas de domínio têm `org_id NOT NULL` (exceto o log
  `webhook_events`, nullable). UNIQUEs são
  org-scoped: `(org_id, phone)`, `(org_id, name)` etc. `app_settings`,
  `ai_agent_config` e `repurchase_config` viraram 1 linha POR ORG.
- **Claims no JWT** (`raw_app_meta_data`, espelhadas por `handle_new_user`):
  `role`, `org_id`, `home_org_id`, `is_super_admin`. Helpers SQL:
  `current_org_id()`, `is_super_admin()`, `current_org_active()`,
  `default_org_id()` (fallback só p/ integrações single-org legadas:
  landing).
- **RLS**: predicado único `org_id = current_org_id() AND current_org_active()`
  + gate de role. Org arquivada = acesso zero (webhooks descartam com 200,
  crons filtram `status='active'`). Super admin NÃO enxerga dados de domínio —
  gerencia orgs no console `/admin` e "entra" numa org via
  `api/admin/switch-org` (troca a claim `org_id` + `refreshSession()`).
- **DEFAULTs de `org_id`**: `current_org_id()` (JWT) nas tabelas de domínio;
  tabelas-filhas têm trigger `_org_from_parent` que herda o org da linha-pai
  (inserts via service role). Edge Functions devem SEMPRE gravar org_id
  explícito em `contacts`/`conversations`.
- **Credenciais POR ORG**: `public.org_settings (org_id, key, value_encrypted)`
  substitui o antigo `public.app_settings` global (mantido como legado).
  `getCredential(orgId, key)` nos dois runtimes; caches keyed por
  `${orgId}:${key}`. Na prática, hoje só `llm_provider`/`llm_api_key`/
  `openai_api_key` são usadas — não existe mais credencial de WhatsApp
  (webjs conecta por QR code, sem API key).
- **Signup só via convite**: `handle_new_user` exige `invited_org_id` +
  `invited_role` no metadata (1º usuário da instância = admin + super admin da
  org padrão `principal`) — OU o caso de signup self-serve acima.
- **Canais (números WhatsApp)**: `whatsapp_hub.channels` — N números por org,
  `provider` sempre `'webjs'`. `conversations.channel_id` / `campaigns.channel_id`
  carimbam o número; envio resolve contexto via
  `_shared/channels.ts::getSendContextForConversation`. `channels.assigned_member`
  = conversas entrantes daquele número são atribuídas automaticamente ao membro
  (fallback: round-robin da org). `channels.ai_enabled` (default true) = IA por
  número: refina o master switch `ai_agent_config.active_whatsapp` — com false,
  conversa nova nasce e é flipada pelo webhook para `human_active`+`ai_paused`
  via UPDATE (o flip dispara os triggers de handoff: notifica o operador
  vinculado, ou rodízio/fanout se o número não tem dono); `process-ai-message`
  também checa `ai_enabled` para conversas existentes. Cenários: número
  compartilhado da equipe = IA + rodízio; número pessoal de vendedor =
  `assigned_member` + `ai_enabled=false`.
- **Perfil de membro**: `app_users.display_name/avatar_url` (bucket público
  `whatsapp-hub-avatars`, path `<org_id>/<user_id>.<ext>`); campos sensíveis
  (`role`, `org_id`, `is_super_admin`) protegidos por trigger `_app_users_guard`.
- **Wizard `/setup`**: 3 passos (Preparar → Credenciais core → Bootstrap). A
  chave da OpenAI é configurada DEPOIS, dentro do CRM, em `/ai-agent`.

---

## Stack

- **Frontend.** React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui.
- **Backend.** Supabase Cloud (Postgres, Auth, Realtime, Edge Functions,
  Storage, pgvector).
- **Worker WhatsApp.** `webjs-worker/` — Node.js puro (não TS), Baileys, roda
  numa VPS própria (fora Vercel/Supabase). Ver seção "Canal de WhatsApp"
  acima.
- **Jobs & Cron.** `pg_cron` (só 2 jobs ativos hoje — ver tabela abaixo).
- **Embeddings.** OpenAI `text-embedding-3-small` (sempre, independente da
  LLM escolhida).
- **LLMs disponíveis.** OpenAI · Anthropic Claude · Google Gemini. A escolha
  fica na credencial `llm_provider` (`org_settings`, configurada em
  `/ai-agent`) e é lida em runtime via `getCredential`.
- **Transcrição de áudio.** OpenAI Whisper.
- **Pagamento.** Mercado Pago, Pix avulso (ver seção de billing acima).
- **Idioma da interface.** Português BR (sem i18n no v1).

---

## Self-Hosted Setup

A instalação de produção é orientada pelo wizard `/setup`. Ele coleta os
tokens de bootstrap, roda migrations, deploya Edge Functions, configura as
envs core na Vercel e persiste credenciais de aplicação criptografadas em
`public.app_settings`.

---

## Arquitetura multi-schema (Supabase compartilhado)

O mesmo Supabase pode hospedar mais de uma app, cada uma no seu próprio
schema PostgreSQL — hoje o projeto real do VIVAS só usa os dois abaixo.

### Schemas ativos

- `public` — reservado para extensions, tipos compartilhados e o cofre de
  credenciais/bootstrap (NÃO usar para dados de aplicação de domínio).
- `whatsapp_hub` — **este projeto (VIVAS CONNECT)**.

### Regras de schema

1. Toda tabela de aplicação fica em `whatsapp_hub.*`.
2. Migrations começam com:
   ```sql
   CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
   SET search_path TO whatsapp_hub;
   ```
3. Cada schema tem seu próprio conjunto de policies RLS.
4. Nunca fazer cross-schema joins sem aprovação explícita.
5. Storage buckets prefixados: `whatsapp-hub-*`.
6. PostgREST precisa expor o schema (ver `README.md` passo 4).

### Padrão de queries no frontend

```ts
const { data } = await supabase
  .schema('whatsapp_hub')
  .from('conversations')
  .select('*');
```

Nunca usar o schema `public` para lógica de aplicação.

---

## Auth & Roles

- Supabase Auth com email/senha.
- Enum `whatsapp_hub.tenant_role` (nome herdado, semântica nova): valores
  permitidos `'admin' | 'operator'`.
- Trigger `whatsapp_hub.handle_new_user` em `auth.users`:
  - Se o convite trouxe `raw_user_meta_data.invited_role` = `'admin'` ou
    `'operator'`, usa esse valor.
  - Caso contrário, conta as linhas em `app_users`. Se zero, o novo usuário
    vira `admin`. Se ≥ 1, vira `operator`.
  - Insere em `app_users (user_id, role, accepted_at = now())`.
  - Espelha a role em `auth.users.raw_app_meta_data.role` para que policies
    possam consultá-la via JWT sem ler `app_users`.
- `app_users` é a tabela de membros da instância. UNIQUE por `user_id`.
- Policies RLS gateiam por `whatsapp_hub.current_user_role()`:
  - `'admin'` — controla templates, campanhas, knowledge, settings, equipe.
  - `'operator'` — opera inbox + contatos + tags do dia a dia.

---

## Banco de dados (schema `whatsapp_hub`)

### Tabelas centrais (reflete o schema real em 2026-08-24)

```
app_users
├── user_id  UUID  (FK auth.users, UNIQUE)
├── role     ENUM('admin','operator')
├── is_online  BOOLEAN
├── last_seen_at, accepted_at, created_at, invited_at

ai_agent_config  (1 linha por org)
├── system_prompt TEXT
├── temperature   FLOAT DEFAULT 0.7
├── max_tokens    INT   DEFAULT 1000
├── is_active     BOOLEAN DEFAULT true
├── active_whatsapp, active_instagram  BOOLEAN  (master switch por canal)

contacts
├── id, phone (E.164, UNIQUE por org), name, email
├── custom_fields JSONB
├── profile_pic_url  (foto do lead — hoje sem fonte ativa; era via UAZAPI)

tags / contact_tags  (N:N)

channels  (N números por org)
├── id, org_id, provider  -- sempre 'webjs'
├── label, phone, webhook_secret
├── assigned_member, is_active, ai_enabled
├── funnel_auto_add, funnel_pipeline_id, funnel_stage_id
    -- vestígio do Funil (removido da UI) — colunas preservadas, sem leitor

templates
├── id, name (UNIQUE por org), language DEFAULT 'pt_BR'
├── body TEXT, variables JSONB (posição → descrição), ai_prompt TEXT
├── category, status, meta_template_id, meta_template_status, header_type,
│   header_content, footer, buttons, submitted_at, approved_at
    -- histórico do fluxo de aprovação Meta/Zernio. Colunas existem, a UI
    -- (TemplateFormDialog/TemplatesList/CampaignWizard) NÃO lê nem escreve
    -- valor real nelas (grava default neutro fixo: category='utility',
    -- header_type='none', footer=null, buttons=[]). Não filtrar campanha
    -- por `status` — nunca muda de 'draft' hoje.

campaigns
├── id, name, template_id, channel_id, status
├── scheduled_at, audience_filter JSONB (all | tag_ids | custom_fields |
│   contact_ids — o último é usado pelo "Enviar mensagem novamente" do
│   relatório Não Responderam), variable_mapping JSONB
├── total_contacts, sent, delivered, read, replied, failed

campaign_contacts  (fila de disparo + métricas por contato)
├── id, campaign_id, contact_id, status, error_message
├── sent_at, delivered_at, read_at, replied_at, claimed_at
├── template_id_override

conversations
├── id, contact_id, channel_id, channel ('whatsapp' | 'instagram')
├── status ENUM('ai_active','human_active','closed')
├── assigned_to, assigned_at, ai_paused, last_message_at, unread_count
├── archived, pinned_note
├── lead_interest  ENUM('nao_classificado','interessado','sem_interesse',
│   'qualificado','venda_concluida')
│   -- interessado: AUTOMÁTICO (trigger dispara quando o contato responde
│   --   qualquer mensagem inbound)
│   -- sem_interesse: AUTOMÁTICO (cron horário `_mark_stale_leads_no_interest`
│   --   marca quem foi contatado há mais de 24h e nunca respondeu)
│   -- qualificado / venda_concluida: MANUAL, botões no ContactPanel.tsx
│   --   ("Alguma atualização sobre esse lead?")
├── active_deal_id  -- vestígio do Funil, sem leitor na UI

messages
├── id, conversation_id, direction ('inbound'|'outbound')
├── sender_type ('contact','ai','operator','system')
├── sender_id, content_type, content, media_url (webjs não usa mídia ainda)
├── meta_status ('sent','delivered','read','failed') -- nome herdado, é
│   status de entrega genérico
├── is_private_note BOOLEAN DEFAULT false

webjs_sessions  (1 linha por org — estado da conexão Baileys)
├── org_id, status ('disconnected'|'connecting'|'connected'|'blocked'|...)
├── qr_data_url, phone, last_error, connected_at
├── blocked_until, block_count, recovery_until, recovery_daily_limit
├── block_kind ('confirmed'|'risk')  -- 403 real/botão manual vs. score de
│   risco da baileys-antiban (indício, não confirmação) — telas diferentes
├── antiban_warmup_state JSONB  (snapshot da lib baileys-antiban)

whatsapp_hub.subscriptions / subscription_payments
    -- ver seção "Cadastro público e billing" acima

knowledge_base (pdf|doc|url → status processing|ready|error)
knowledge_chunks (embedding VECTOR(1536), pgvector)
notifications (new_message|handoff|mention, filtrada por user_id=auth.uid())

deals, pipelines, stages, deal_products, lead_stage_history
    -- Funil removido da UI (2026-08-22) por decisão de produto ("vendas é
    -- secundário"). Tabelas PRESERVADAS de propósito (dado histórico, não
    -- apagado) mas SEM tela pra criar/editar — não usar em feature nova sem
    -- alinhar com o dono primeiro. Trigger órfão `on_deal_stage_automation`
    -- já foi removido (migration `20260823140000`).
```

### RPCs notáveis

- `whatsapp_hub.lead_dashboard_metrics(p_from, p_to)` — json com
  sent/contacted/responded/not_responded/waiting_ai/transferred_human/
  closed/open/interested/not_interested/qualified/sold/by_tag. Fonte do
  Dashboard (`useLeadsDashboard.ts`).
- `whatsapp_hub.non_responders(p_hours int default 24)` — contatos
  contatados há mais de `p_hours` e que nunca responderam. Fonte do
  relatório "Não responderam" (`NonRespondersTab.tsx`).
- `whatsapp_hub.mark_webjs_blocked(p_org_id, p_reason)` — SECURITY DEFINER
  com checagem explícita de autorização (só service_role ou admin da
  própria org). Ver seção de bloqueio/recuperação acima.
- `whatsapp_hub.knowledge_search(p_query_embedding vector, p_top_k int)` —
  similarity search (cosine) no corpus RAG.
- `whatsapp_hub.current_user_role()` — usado nas policies RLS.

### Credenciais e bootstrap (schema `public`)

Diferente das tabelas de domínio (que vivem em `whatsapp_hub`), o cofre de
credenciais e o estado de bootstrap ficam em `public` por serem infra de
instância, não dados de aplicação:

```
public.app_settings              <- credenciais CORE de instância (bootstrap)
├── key             text PK
├── value_encrypted text          (AES-256-GCM, formato "iv:tag:cipher")
└── updated_at      timestamptz

public._bootstrap_state           <- checkpoints idempotentes do wizard /setup
├── step         text PK
├── completed_at timestamptz
└── metadata     jsonb
```

- Credencial de aplicação **por org** (LLM/OpenAI) fica em
  `public.org_settings`, não em `app_settings` — ver "Multi-tenancy" acima.
- Ambas têm RLS habilitado **sem nenhuma policy** → inacessíveis a `anon` e
  `authenticated`. Só a service role (API Routes Vercel + Edge Functions) lê e
  escreve.
- `CRYPTO_KEY` (env core) decifra os valores; sem ela os dados são
  irrecuperáveis.

---

## pg_cron jobs (ativos em 2026-08-24)

| Job                        | Cadência       | Função                                          |
|----------------------------|----------------|--------------------------------------------------|
| `subscription-lifecycle`   | 1×/dia (03:17) | `process_subscription_lifecycle()` (ciclo de billing) |
| `wh-mark-stale-leads`      | 1×/hora        | `_mark_stale_leads_no_interest()` (marca `sem_interesse` automático) |

> Jobs antigos do modelo Zernio (`dispatch-campaign`, `sync-broadcast-status`,
> `check-follow-ups`, `repurchase-predictions-daily`, `repurchase-dispatch-daily`)
> foram desagendados em 2026-08-22/23 — as Edge Functions correspondentes
> não existem mais. Disparo em massa hoje é feito pelo `campaignWorker.js`
> (poll direto no `webjs-worker`, não por cron do Postgres).

---

## Funcionalidades

### Templates (mensagem pronta pra campanha)

Sem aprovação da Meta — é só texto reaproveitável:

1. Operador dá nome, idioma, escreve o corpo (ou pede pra IA gerar a partir
   de um objetivo) e marca variáveis `{{1}}`, `{{2}}`...
2. `generate-template` Edge Function: lê o provider/chave de LLM da org,
   monta o prompt (focado em soar natural — texto robótico/spam aumenta
   risco de bloqueio) e devolve `{ body }`.
3. Salva direto — sem fila de aprovação, sem categoria Marketing/Utility.

### Disparos em massa (VIVAS Envia)

1. Escolher template + (se houver mais de um número ativo) o canal.
2. Audiência: todos os contatos, por tags, ou por campo customizado — OU
   lista explícita de contatos (`audience_filter.contact_ids`), usada pelo
   relatório "Não responderam".
3. Mapear variáveis do template → nome do contato ou valor fixo.
4. Agendar ou disparar imediatamente.
5. `campaignWorker.js` (no `webjs-worker`, poll interno — não é cron do
   Postgres) processa `campaign_contacts.pending` respeitando o motor
   anti-bloqueio (ver seção "Canal de WhatsApp" acima) e o limite reduzido
   durante recuperação de bloqueio.

### Classificação de lead (automática + manual)

- `interessado` — automático, dispara quando o contato responde qualquer
  mensagem (trigger em `messages`, INSERT inbound).
- `sem_interesse` — automático, `wh-mark-stale-leads` (cron horário) marca
  quem foi contatado há >24h sem nunca responder.
- `qualificado` / `venda_concluida` — manual, prompt "Alguma atualização
  sobre esse lead?" no `ContactPanel.tsx` do inbox.

### Relatório "Não responderam"

Substituiu o follow-up automático (decisão do dono: automatizar reenvio
é mais arriscado pra banimento do que um processo manual). Lista contatos
alcançados há mais de 24h que nunca responderam
(`whatsapp_hub.non_responders`); botão "Enviar mensagem novamente" cria uma
campanha nova só com os selecionados; exporta CSV.

### Agente IA + RAG

- Knowledge base aceita PDFs, docs e URLs (até 30MB no total).
- `process-knowledge`: extract → chunk (500 tokens, overlap 50) → embed
  (`text-embedding-3-small`, 1536d) → store em `knowledge_chunks`.
- Mensagem inbound aciona `process-ai-message`:
  1. Gate: conversa não fechada/pausada + `ai_agent_config.is_active` +
     toggle da plataforma (`active_whatsapp`/`active_instagram`) +
     `channels.ai_enabled` do número da conversa. Se qualquer um falhar,
     flipa a conversa para `human_active`+`ai_paused` (dispara handoff) e
     não responde.
  2. Busca top-5 chunks via `knowledge_search`.
  3. Monta prompt com `system_prompt` + contexto + histórico da conversa.
  4. Chama o provider configurado (`llm_provider`).
  5. Envia resposta via `webjs-worker` (texto puro, sem template/mídia).
- Handoff: operador clica "Pausar IA" → `conversation.ai_paused = true` →
  triggers do flip false→true: `_on_handoff_autoassign` (round-robin da fila
  `lead_assignment_queue`, só membros `is_online`) e `_on_handoff_notify`
  (notifica o responsável; sem responsável, fanout pra todos operadores).
- Áudio do contato → `transcribe-audio` → Whisper → salva como `content`.

### Inbox

- Layout 3 painéis (lista de conversas, thread, dados do contato).
- Realtime via Supabase Realtime nos canais de `messages` e `conversations`.
- Notas privadas (`is_private_note = true`) — fundo diferenciado, locais.
- Atribuição automática: (1) `channels.assigned_member` do número atribui na
  chegada; (2) senão, no handoff, round-robin entre operadores `is_online`.
  Manual nunca é sobrescrito.
- Sem janela de 24h pra WhatsApp (webjs); Instagram mantém a janela real.
- Filtros: canal (WhatsApp/Instagram), status, assigned_to, tags, período.

### Dashboard (leads, não vendas)

Cards de contagem: enviados, contatados, responderam, não responderam, IA
aguardando, transferido pra humano, qualificados, vendas concluídas,
interessado/sem interesse, por tag. Métricas de disparo (taxa de entrega/
leitura/resposta, volume por dia, performance por campanha) vivem na aba
"Métricas" dentro de Campanhas (`DispatchMetrics.tsx`), não no Dashboard.

### VIVAS Perfil

Site público do corretor (`agent_sites`), item próprio da barra lateral
(não é mais uma aba de Configurações). Porta de entrada de lead — link que
o corretor divulga, capta contato e alimenta o inbox/IA.

---

## Estrutura de pastas (frontend)

```
src/
├── app/
│   ├── routes/
│   │   ├── setup/            Bootstrap Supabase (URL + anon key → localStorage)
│   │   ├── auth/             Login, signup
│   │   ├── dashboard/        Métricas de LEAD (não vendas)
│   │   ├── inbox/
│   │   ├── campaigns/        Campanhas + Templates + Não Responderam + Métricas
│   │   ├── vivas-perfil/     Item de sidebar (reusa AgentSiteSettings)
│   │   ├── vivas-envia/      Item de sidebar (reusa WebjsSettings)
│   │   ├── contacts/
│   │   ├── ai-agent/         Agente IA + Base de Conhecimento
│   │   └── settings/
│   │       ├── SettingsPage.tsx
│   │       └── sections/
│   │           ├── AccountSettings.tsx
│   │           ├── AIAgentSettings.tsx
│   │           ├── BusinessHoursSettings.tsx
│   │           ├── ProductsSettings.tsx
│   │           ├── TeamSettings.tsx
│   │           ├── ThemeSettings.tsx     (6 paletas de cor)
│   │           ├── AgentSiteSettings.tsx (VIVAS Perfil)
│   │           ├── AgentMediaSettings.tsx
│   │           └── WebjsSettings.tsx     (VIVAS Envia — QR, bloqueio, recuperação)
│   ├── layout/               AppLayout, Sidebar (nav-config.ts), Header
│   ├── router.tsx            RequireSetup → RequireSession → SubscriptionGate → AppLayout
│   └── providers/
│       ├── SupabaseProvider.tsx
│       ├── AuthProvider.tsx
│       ├── ThemeProvider.tsx  (6 temas de cor, data-theme na <html>)
│       └── AppUserProvider.tsx
├── components/
│   ├── ui/                   primitives shadcn
│   ├── inbox/                ChatBubble, ConversationList, ContactPanel, …
│   ├── campaigns/            CampaignWizard, TemplatesList, NonRespondersTab,
│   │                         DispatchMetrics
│   ├── templates/            TemplateFormDialog (nome/idioma/corpo/variáveis + IA)
│   ├── contacts/             ContactTable, CSVUploader, TagManager
│   └── NotificationsDropdown.tsx
├── hooks/                    useCampaigns, useConversations, useTemplates,
│                             useContacts, useKnowledgeBase, useLeadsDashboard,
│                             useMessages, useNotifications, useTags, useSubscription
├── lib/                      supabase.ts (dynamic client), phone.ts (E.164)
├── types/                    db, inbox, campaigns, templates, knowledge
└── styles/globals.css        Tailwind v4 + dark glassmorphism tokens + 6 temas
```

Não existem mais: tela de Funil (`/funil`), Automações (`/automations`,
`/follow-ups` — ambas redirecionam pro dashboard/campanhas), tela de
Canais/credenciais de WhatsApp (`/settings?tab=channels`).

## Edge Functions

```
supabase/functions/
├── _shared/
│   ├── auth.ts               requireCaller, requireAdmin (JWT validation)
│   ├── cors.ts                jsonResponse, preflight
│   ├── llm.ts                 multi-provider adapter (OpenAI/Claude/Gemini)
│   ├── supabase-admin.ts      service role client
│   ├── credentials.ts         getCredential()/setCredential() sobre public.app_settings
│   ├── tenant-credentials.ts  loadAppCredentials() → wrapper tipado de getCredential
│   └── channels.ts            resolve canal/contexto de envio — só provider 'webjs'
├── process-ai-message/       RAG → LLM → resposta via webjs-worker (texto puro)
├── process-knowledge/        upload → chunk → embed → store
├── transcribe-audio/         baixa áudio → Whisper
├── generate-template/        prompt → LLM → { body } (sem categoria/header/botões)
├── send-operator-message/    operador envia texto / nota privada pela inbox
├── webjs-activate/           liga a IA/o número webjs pra org
├── webjs-deactivate/         desliga
├── webjs-report-block/       botão manual "Fui bloqueado" → mark_webjs_blocked RPC
├── create-pix-charge/        billing — gera/reaproveita QR Pix
├── mercadopago-webhook/      billing — público, rebusca pagamento na API do MP
├── invite-team-member/       convite nativo do Supabase Auth (inviteUserByEmail)
└── delete-team-member/       remove membro da org
```

> Removidas em 2026-08-22 (Zernio/UAZAPI e o que dependia deles):
> `zernio-webhook`, `uazapi-webhook`, `test-zernio-connection`,
> `zernio-number-status`, `sync-broadcast-status`, `sync-template-status`,
> `submit-template`, `dispatch-campaign`, `check-follow-ups`,
> `repurchase-dispatch`, `funnel-automation`, `simulate-inbound`,
> `send-operator-media`, `send-operator-template`. Nenhum código atual
> chama essas funções — se algum dia aparecer uma chamada pra uma delas
> num componente novo/reaproveitado, é bug, não feature esquecida.

---

## Convenções de código

### Geral
- TypeScript strict mode.
- ESLint + Prettier.
- Componentes: PascalCase. Hooks: `useThing.ts`. Edge Functions: kebab-case.
- Comentários: português para regra de negócio; inglês para código técnico.
- **Animação: GSAP, não `@keyframes` CSS novo** (decisão 2026-08-24). Skills
  oficiais instaladas em `.agents/skills/gsap-*` (via
  `npx skills add greensock/gsap-skills`) — consultar antes de animar algo.
  Padrão: `useGSAP` com `scope`, `gsap.matchMedia()` pra
  `prefers-reduced-motion`, `gsap.quickTo()` pra valor atualizado a cada
  mousemove, timeline em vez de várias transições CSS soltas. CSS
  `transition` simples (`:hover`, spinner `animate-spin`) continua OK — é
  a própria recomendação da skill pra caso trivial.

### Supabase / frontend
- Client criado via `getSupabase()` a partir das envs core injetadas no build
  apos o wizard `/setup`.
- **Sempre** usar `.schema('whatsapp_hub')` no client.
- Tipos manuais em `src/types/`. Não usamos `supabase gen types` no v1.

### Edge Functions
- Toda função pública passa pelos helpers `_shared/auth.ts`. Nunca pular essa
  validação (exceção deliberada: `mercadopago-webhook`, público por natureza,
  mas nunca confia no corpo — sempre rebusca na API do MP).
- Credenciais de aplicação têm como **fonte de verdade** `public.org_settings`
  (por org) / `public.app_settings` (core de instância), lidas via
  `getCredential`. `Deno.env.get(...)` fica restrito a envs core
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRYPTO_KEY`,
  `MERCADOPAGO_ACCESS_TOKEN`).
- Resposta padrão: `{ ok, data?, error? }` via `jsonResponse`.
- Logging estruturado: `console.log(JSON.stringify({ event, ... }))`.

### Segurança
- Tokens / API keys nunca trafegam pelo frontend — todas as chamadas a
  OpenAI/Claude/Gemini/Mercado Pago saem das Edge Functions.
- RPCs `SECURITY DEFINER` que aceitam `org_id` como parâmetro (ex.
  `mark_webjs_blocked`) SEMPRE checam explicitamente que quem chama é
  `service_role` OU admin da própria org — nunca confiar cegamente no
  parâmetro recebido.

---

## Design System — Dark Mode Glassmorphism (OBRIGATÓRIO)

A plataforma é **dark mode only**. Não implementar light mode. Não criar
toggle claro/escuro.

**Multi-tema (2026-08-22, `ThemeProvider.tsx` + aba Configurações > Temas)**:
existe escolha de PALETA de cor — 6 opções (`vivas-premium` é o
padrão/marca: azul + dourado + branco), trocada via atributo `data-theme` na
`<html>`, tokens definidos em `globals.css`. É preferência pessoal por
navegador (`localStorage`), não identidade da organização. Todo componente
deve usar `var(--accent-primary)` / `var(--accent-secondary)` /
`rgba(var(--accent-primary-rgb), X)` — **nunca hardcodear hex/rgba de cor de
marca**, senão fica preso ao tema antigo. Cores de dado/gráfico (`--data-*`)
são fixas e NÃO seguem o tema, de propósito (ver `globals.css`).

### Tokens de cor (tema padrão `vivas-premium`)

| Token                  | Valor                                        |
|------------------------|----------------------------------------------|
| `--bg-primary`         | `#0A0A0F`                                    |
| `--bg-card`            | `rgba(15, 18, 35, 0.6)`                      |
| `--border-card`        | `rgba(232, 185, 74, 0.15)`                   |
| `--accent-primary`     | `#E8B94A` (dourado — cor dominante do tema)  |
| `--accent-secondary`   | `#3B82F6` (azul — cor complementar)          |
| `--text-primary`       | `#F8FAFC`                                    |
| `--text-secondary`     | `#94A3B8`                                    |
| `--text-label`         | `#CBD5E1`                                    |
| `--color-success`      | `#10B981`                                    |
| `--color-error`        | `#EF4444`                                    |

> Os outros 5 temas (Grafite & Aço, Vinho & Ouro Velho, Esmeralda & Bronze,
> Rosé & Champagne, Lilás & Prata) redefinem os mesmos tokens com valores
> próprios — ver `globals.css` pra lista completa.

### Background glow (no `body`)

```css
body {
  background-color: #0A0A0F;
  background-image:
    radial-gradient(ellipse at 20% 0%, rgba(59, 130, 246, 0.06), transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(37, 99, 235, 0.04), transparent 50%);
  min-height: 100vh;
}
```

### Glass card padrão

```css
.glass-card {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.02));
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 16px;
  box-shadow:
    0 0 20px rgba(59, 130, 246, 0.06),
    inset 0 1px 0 rgba(59, 130, 246, 0.1);
}

.glass-card:hover {
  border-color: rgba(59, 130, 246, 0.45);
  box-shadow:
    0 0 30px rgba(59, 130, 246, 0.12),
    0 0 60px rgba(59, 130, 246, 0.04),
    inset 0 1px 0 rgba(59, 130, 246, 0.2);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Tipografia

```css
* { font-family: 'Inter', sans-serif; }

.text-display { font-weight: 700; }
.text-stat    { font-size: 2.5rem; font-weight: 800; }

.text-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.text-body { font-weight: 400; font-size: 0.875rem; }
```

### Bordas e separadores

- Borders padrão: `rgba(59, 130, 246, 0.12)`.
- Dividers: `rgba(59, 130, 246, 0.08)`.
- Sidebar `border-right`: `1px solid rgba(59, 130, 246, 0.1)`.
- Header `border-bottom`: `1px solid rgba(59, 130, 246, 0.08)`.

Componentes devem usar `var(--accent-primary)` / `var(--accent-secondary)` em
vez de hardcodear `#3B82F6` / `#60A5FA`. Os hex listados acima são apenas o
fallback default.

---

## Notas de migração e histórico não-óbvio

- **Migração Meta Cloud API → Zernio → webjs (Baileys).** O sistema já
  passou por duas migrações de canal de WhatsApp. A primeira (Meta direto →
  Zernio) deixou nomes de coluna herdados que ainda existem mesmo sem Zernio:
  `messages.meta_status` (é status de entrega genérico, não tem nada a ver
  com Meta hoje), `campaign_contacts.zernio_message_id`/
  `zernio_conversation_id`/`zernio_broadcast_id`, `campaigns.zernio_broadcast_id`,
  `conversations.zernio_conversation_id`/`zernio_account_id` — colunas
  mortas, ninguém escreve nelas desde 2026-08-22, preservadas só por não
  valer a pena uma migração de DROP pra algo cosmético. **Não usar essas
  colunas em código novo.**
- `tenant_members` foi renomeada para `app_users` numa migração SaaS → OSS
  anterior a este histórico. O enum `whatsapp_hub.tenant_role` manteve o
  nome por inércia, mas hoje só aceita `'admin' | 'operator'`.
- `campaign_contacts.template_id_override` é per-row — resquício de um
  motor de follow-up antigo que usava isso pra sobrescrever o template do
  envio. Sem uso ativo hoje (follow-up é manual), mas a coluna continua.
- A Vault entry `whatsapp_hub_encryption_key` ainda existe por motivos
  históricos, mas nenhum código atual consome `encrypt_secret`/`decrypt_secret`.
- **Funil (deals/pipelines/stages) removido da UI em 2026-08-22** — decisão
  de produto, não técnica ("vendas é secundário, o produto é lead").
  Tabelas preservadas com dado histórico; sem tela pra criar/editar. Rotas
  `/funil`, `/automations`, `/follow-ups` redirecionam pro dashboard ou
  campanhas. Trigger órfão `on_deal_stage_automation` já removido
  (migration `20260823140000`).
- **Zernio/UAZAPI removidos por completo em 2026-08-22** — ver seção
  "Canal de WhatsApp" no topo deste arquivo pro estado atual. Antes de
  supor que uma funcionalidade "usa Zernio", checar o código real — o nome
  pode ter sobrevivido só como coluna morta ou comentário.
