'use strict';

const logger = require('./logger');
const sessionManager = require('./sessionManager');
const { buildCandidates } = require('./phone');
const { resolveDisplayName } = require('./nameValidator');
const { buildMessage } = require('./spintax');
const sentMessageStore = require('./sentMessageStore');

// Heurísticas conservadoras de mercado (mesmas do Disparador-WPP original) —
// são o preset "seguro" e o fallback de qualquer org sem linha em
// dispatch_settings (2026-08-27: virou configurável por org — ver
// getDispatchConfig abaixo — mas quem nunca mexeu continua exatamente nesse
// comportamento de sempre, sem precisar optar em nada).
const DEFAULTS = {
  delayCurtoMinSeconds: 35,
  delayCurtoMaxSeconds: 80,
  delayMedioACadaMensagens: 8,
  delayMedioACadaMensagensJitter: 2,
  delayMedioMinMinutes: 4,
  delayMedioMaxMinutes: 9,
  delayLongoACadaMensagens: 30,
  delayLongoACadaMensagensJitter: 5,
  delayLongoMinMinutes: 20,
  delayLongoMaxMinutes: 35,
  dailyLimit: 150,
  // Plano Bot é o disparo "limitado" (ver src/lib/plans.ts) — menos
  // mensagens/dia e delay curto mais espaçado que o Plano Jarvis. Números
  // ajustados 2026-08-31 (pedido do dono: "60 mensagens por dia com delays
  // de 50%, 80 tava muito grande") — PLAN_COMPARISON em lib/plans.ts
  // precisa continuar batendo com esses valores.
  dailyLimitBotPlan: 60,
  botPlanDelayMultiplier: 1.5,
  workingHourStart: 8,
  workingHourEnd: 20,
  workingDays: [1, 2, 3, 4, 5, 6], // seg-sab (0 = domingo)
  minTypingMs: 800,
  maxTypingMs: 6000,
};

// orgId -> estado do motor anti-bloqueio dessa org (em memória — reseta se o
// worker reiniciar; não é crítico, só faz o ciclo de delay recomeçar).
const orgState = new Map();

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}
function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}
function pickThreshold(base, jitter) {
  return Math.max(1, base + randomInt(-jitter, jitter));
}

function getState(orgId) {
  if (!orgState.has(orgId)) {
    orgState.set(orgId, {
      sinceMedio: 0,
      nextMedioThreshold: pickThreshold(DEFAULTS.delayMedioACadaMensagens, DEFAULTS.delayMedioACadaMensagensJitter),
      sinceLongo: 0,
      nextLongoThreshold: pickThreshold(DEFAULTS.delayLongoACadaMensagens, DEFAULTS.delayLongoACadaMensagensJitter),
      sentToday: 0,
      // Dia no fuso de Brasília, não no do servidor (que é UTC) — senão o
      // "dia" do limite virava às 21h, igual ao bug já corrigido no
      // Professor Resposta.
      dayKey: agoraEmBrasilia().data,
      // null = ainda não trouxemos o contador do banco nesse dia. Ver
      // hidratarContadorDiario().
      hidratadoPara: null,
      nextAllowedAt: 0,
    });
  }
  const st = orgState.get(orgId);
  const today = agoraEmBrasilia().data;
  if (st.dayKey !== today) {
    st.dayKey = today;
    st.sentToday = 0;
    st.hidratadoPara = null;
  }
  return st;
}

// BUG REAL (2026-09-11): o contador de envios do dia vivia SÓ em memória.
// Reiniciar o worker (deploy, queda, pm2 restart) zerava tudo e a org ganhava
// o limite diário inteiro de novo no mesmo dia — o oposto do que o motor
// anti-bloqueio deveria fazer.
//
// Agora a verdade mora no banco (whatsapp_hub.campaign_daily_sends). Lemos
// UMA vez por org por dia pra não bater no banco a cada tick de 5s; a partir
// daí o contador em memória e o do banco andam juntos (cada envio soma nos
// dois).
async function hidratarContadorDiario(supabase, orgId, state) {
  const hoje = state.dayKey;
  if (state.hidratadoPara === hoje) return;

  const { data, error } = await supabase.rpc('get_campaign_daily_sends', { p_org_id: orgId });
  if (error) {
    // Falha de leitura não pode liberar envio à vontade. Mantém o que já
    // temos em memória e tenta de novo no próximo tick.
    logger.error('Não consegui ler o contador diário de envios', { orgId, message: error.message });
    return;
  }

  const doBanco = data ?? 0;
  // Math.max: se o worker já enviou algo antes da hidratação, não perde.
  state.sentToday = Math.max(state.sentToday, doBanco);
  state.hidratadoPara = hoje;
  logger.info('Contador diário recuperado do banco', { orgId, enviadosHoje: state.sentToday });
}

// BUG REAL (2026-09-11): a VPS roda em Etc/UTC e o PM2 não define TZ, então
// `new Date().getHours()` devolvia a hora UTC. Com workingHour 8-20, o que o
// cliente lê como "8h às 20h" acontecia de verdade das 5h às 17h de Brasília
// — mensagem comercial saindo às 5 da manhã e o disparo parando às 17h.
//
// Calculado explicitamente em America/Sao_Paulo em vez de depender da TZ do
// processo: assim continua certo mesmo se o worker for movido pra outro
// servidor, ou se alguém recriar a VPS sem setar TZ.
const FUSO_BRASIL = 'America/Sao_Paulo';
const DIAS_SEMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function agoraEmBrasilia() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSO_BRASIL,
      hourCycle: 'h23', // sem isso, meia-noite pode virar "24"
      hour: '2-digit',
      weekday: 'short',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    hora: parseInt(partes.hour, 10),
    diaSemana: DIAS_SEMANA[partes.weekday],
    data: new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_BRASIL }).format(new Date()), // YYYY-MM-DD
  };
}

function isWithinWorkingWindow() {
  const { hora, diaSemana } = agoraEmBrasilia();
  return (
    DEFAULTS.workingDays.includes(diaSemana) &&
    hora >= DEFAULTS.workingHourStart &&
    hora < DEFAULTS.workingHourEnd
  );
}

// org sem linha em subscriptions (isenta de billing) conta como Jarvis —
// mesma regra de isOrgAllowedToSend logo abaixo.
async function getOrgPlan(supabase, orgId) {
  const { data } = await supabase.from('subscriptions').select('plan').eq('org_id', orgId).maybeSingle();
  return data?.plan ?? null;
}

function defaultsConfig() {
  return {
    dailyLimit: DEFAULTS.dailyLimit,
    delayCurtoMinSeconds: DEFAULTS.delayCurtoMinSeconds,
    delayCurtoMaxSeconds: DEFAULTS.delayCurtoMaxSeconds,
    delayMedioACadaMensagens: DEFAULTS.delayMedioACadaMensagens,
    delayMedioMinMinutes: DEFAULTS.delayMedioMinMinutes,
    delayMedioMaxMinutes: DEFAULTS.delayMedioMaxMinutes,
    delayLongoACadaMensagens: DEFAULTS.delayLongoACadaMensagens,
    delayLongoMinMinutes: DEFAULTS.delayLongoMinMinutes,
    delayLongoMaxMinutes: DEFAULTS.delayLongoMaxMinutes,
  };
}

// Config de disparo por org (whatsapp_hub.dispatch_settings, 2026-08-27):
// admin escolhe modo seguro (150/dia, preset = DEFAULTS), arriscado (250/dia,
// delays mais apertados) ou manual (valores livres, com limites de sanidade
// no CHECK da tabela). Sem linha = preset seguro, idêntico ao comportamento
// de antes dessa feature existir.
//
// Plano Bot NUNCA lê essa tabela — ignora de propósito. É o plano
// limitado/barato (ver src/lib/plans.ts); se lesse dispatch_settings, um
// admin de plano Bot poderia se autopromover pro limite de um plano
// superior só mexendo num select na tela, o que anularia o gate de plano.
async function getDispatchConfig(supabase, orgId) {
  const { data } = await supabase
    .from('dispatch_settings')
    .select(
      'daily_limit, delay_curto_min_seconds, delay_curto_max_seconds, delay_medio_a_cada, ' +
        'delay_medio_min_minutes, delay_medio_max_minutes, delay_longo_a_cada, ' +
        'delay_longo_min_minutes, delay_longo_max_minutes',
    )
    .eq('org_id', orgId)
    .maybeSingle();
  if (!data) return defaultsConfig();
  return {
    dailyLimit: data.daily_limit,
    delayCurtoMinSeconds: data.delay_curto_min_seconds,
    delayCurtoMaxSeconds: data.delay_curto_max_seconds,
    delayMedioACadaMensagens: data.delay_medio_a_cada,
    delayMedioMinMinutes: Number(data.delay_medio_min_minutes),
    delayMedioMaxMinutes: Number(data.delay_medio_max_minutes),
    delayLongoACadaMensagens: data.delay_longo_a_cada,
    delayLongoMinMinutes: Number(data.delay_longo_min_minutes),
    delayLongoMaxMinutes: Number(data.delay_longo_max_minutes),
  };
}

// Limite diário efetivo: a base depende do plano (Bot é limitado de
// propósito e ignora dispatch_settings — ver getDispatchConfig) ou da
// config de disparo da org (Jarvis/isenta), a não ser que a org esteja numa
// janela de recuperação pós-bloqueio (recovery_until no futuro) — aí usa o
// limite reduzido calculado por mark_webjs_blocked (40/25/15, escalando
// conforme quantas vezes já bloqueou), que é sempre mais restritivo que
// qualquer plano ou config manual.
async function getEffectiveDailyLimit(supabase, orgId, plan, cfg) {
  const { data } = await supabase
    .from('webjs_sessions')
    .select('recovery_until, recovery_daily_limit')
    .eq('org_id', orgId)
    .maybeSingle();
  if (data?.recovery_until && data.recovery_daily_limit && new Date(data.recovery_until).getTime() > Date.now()) {
    return data.recovery_daily_limit;
  }
  return plan === 'bot' ? DEFAULTS.dailyLimitBotPlan : cfg.dailyLimit;
}

// Trava de billing: campanha nunca roda pra org com pagamento pendente ou
// bloqueada, mesmo que a sessão do WhatsApp continue conectada.
async function isOrgAllowedToSend(supabase, orgId) {
  const { data: sub } = await supabase.from('subscriptions').select('status').eq('org_id', orgId).maybeSingle();
  if (!sub) return true; // sem linha = org isenta do billing (dono da plataforma, convite direto)
  return sub.status === 'active' || sub.status === 'grace_period';
}

// BUG REAL encontrado em produção (2026-08-27): campaign.variable_mapping
// (configurado no wizard — "{{1}} = nome do contato" ou "= valor fixo X")
// NUNCA era lido aqui — qualquer template com variável numerada ({{1}},
// {{2}}...) mandava o texto LITERAL "{{1}}" pro contato de verdade, porque
// só {{nome}}/{{empreendimento}} (sintaxe antiga, herdada do
// legacy-disparador-wpp) eram resolvidos. Isso afeta tanto o wizard quanto
// o QuickSendCard novo (2026-08-27), que dependem de {{1}}/variable_mapping
// pra personalizar com o nome do contato.
// BUG REAL encontrado em produção (2026-08-29, reportado pelo dono): quando
// a campanha usa "{{1}} = nome do contato", o valor ia pro cliente sem
// checar se aquilo realmente PARECE nome de pessoa — uma planilha com "nome"
// = razão social colada, tagline de importação, ou vazio mandava "Olá,
// IMOBILIARIA SANTA FE LTDA!" ou "Olá, !" pro cliente de verdade. O
// placeholder antigo {nome} (spintax, ver buildMessage abaixo) já tinha essa
// checagem — faltava aplicar a mesma regra aqui. 2026-08-30: a regra virou
// "extrai só o primeiro nome" (resolveDisplayName, ver nameValidator.js).
function resolveVariableMapping(body, variableMapping, contact) {
  if (!variableMapping || typeof variableMapping !== 'object') return body;
  let result = body;
  for (const [key, source] of Object.entries(variableMapping)) {
    let value = '';
    if (source?.source === 'literal') {
      value = source.value ?? '';
    } else if (source?.source === 'contact_field') {
      if (source.field === 'name') {
        value = resolveDisplayName(contact.name) ?? source.fallback ?? '';
      } else {
        value = contact.custom_fields?.[source.field] ?? source.fallback ?? '';
      }
    }
    result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
  }
  return result;
}

async function sendToContact({ supabase, orgId, sock, campaign, campaignContact, contact, templateBody, state }) {
  try {
    const candidates = buildCandidates(contact.phone);
    if (candidates.length === 0) {
      await supabase.from('campaign_contacts').update({ status: 'failed', error_message: 'Telefone inválido' }).eq('id', campaignContact.id);
      return;
    }

    let jid = null;
    for (const digits of candidates) {
      try {
        const [result] = await sock.onWhatsApp(digits);
        if (result?.exists && result.jid) {
          jid = result.jid;
          break;
        }
      } catch {
        // tenta o próximo candidato
      }
    }
    if (!jid) {
      await supabase
        .from('campaign_contacts')
        .update({ status: 'failed', error_message: 'Número não encontrado no WhatsApp' })
        .eq('id', campaignContact.id);
      return;
    }

    const nomeResolvido = resolveDisplayName(contact.name);
    const mappedBody = resolveVariableMapping(templateBody, campaign.variable_mapping, contact);
    const message = buildMessage(
      mappedBody,
      { nome: nomeResolvido || contact.name, empreendimento: contact.custom_fields?.empreendimento },
      nomeResolvido || '',
    );

    // Simulação de digitação: tempo proporcional ao tamanho do texto, com
    // variação de +-20% — evita o padrão robótico de "mensagem instantânea".
    const rawTyping = Math.min(DEFAULTS.maxTypingMs, Math.max(DEFAULTS.minTypingMs, message.length * 45));
    // Variacao ampliada de ±20% pra ±35% (2026-09-01) -- deixa o tempo de
    // "digitando..." simulado menos regular entre envios, sem mudar o
    // limite/velocidade de disparo (so afeta esse delay especifico).
    const typingMs = Math.round(rawTyping * (0.65 + Math.random() * 0.7));
    // Mesma mitigação de oneToOne.js: contato que já mandou mensagem antes
    // pode ter uma forma de JID (lid/telefone) diferente da que onWhatsApp()
    // acabou de devolver -- manda pra forma que a sessão Signal já conhece
    // de verdade, evitando "Aguardando mensagem" travado no destinatário.
    const canonicalizer = sessionManager.getJidCanonicalizer(orgId);
    const targetJid = canonicalizer?.canonicalizeTarget(jid) ?? jid;

    await sock.sendPresenceUpdate('composing', targetJid);
    await new Promise((resolve) => setTimeout(resolve, typingMs));
    await sock.sendPresenceUpdate('paused', targetJid);
    // baileys-antiban exige o 3o argumento (options) em sendMessage -- sem
    // ele, `options.circuitBreaker` explode com "Cannot read properties of
    // undefined" (mesmo bug real encontrado em oneToOne.js, 2026-09-03;
    // corrigido aqui antes de qualquer campanha real ter rodado).
    // Renova a sessão antes de enviar se esse destino já falhou antes (mesma
    // proteção do oneToOne.js) -- em disparo em massa, mensagem travada em
    // "Aguardando mensagem" é lead perdido em silêncio.
    await sentMessageStore.forceFreshSessionIfNeeded(sock, targetJid);

    const sentCampaignMsg = await sock.sendMessage(targetJid, { text: message }, {});
    // Mesma proteção do oneToOne.js: guarda o conteúdo pra conseguir reenviar
    // se o celular do destinatário pedir. Em disparo em massa isso importa
    // ainda mais -- uma mensagem travada em "Aguardando mensagem" é um lead
    // perdido silenciosamente. Ver sentMessageStore.js.
    sentMessageStore.remember(sentCampaignMsg?.key?.id, message);

    await supabase
      .from('campaign_contacts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignContact.id);
    await supabase
      .from('campaigns')
      .update({ sent: (campaign.sent ?? 0) + 1 })
      .eq('id', campaign.id);

    // A baileys-antiban rastreia erro 463 (reachout timelock) e 403
    // internamente a cada envio — não aparecem na desconexão, só aqui. Se o
    // risco calculado subir pra high/critical, marca bloqueio na nossa
    // própria tabela (a lib não sabe da nossa recuperação/limite diário).
    await checkAntibanRisk(supabase, orgId, sock);

    state.sentToday += 1;
    state.sinceMedio += 1;
    state.sinceLongo += 1;
    // Persiste o envio: se o worker cair agora, o contador de hoje continua
    // valendo quando ele voltar (ver hidratarContadorDiario).
    const { data: totalNoBanco, error: bumpErr } = await supabase.rpc('bump_campaign_daily_send', {
      p_org_id: orgId,
    });
    if (bumpErr) {
      logger.error('Não consegui gravar o envio no contador diário', { orgId, message: bumpErr.message });
    } else if (typeof totalNoBanco === 'number') {
      // Banco é a verdade — mantém a memória alinhada.
      state.sentToday = totalNoBanco;
    }
    logger.success('Mensagem enviada', { orgId, contato: contact.name, enviadosHoje: state.sentToday });
  } catch (err) {
    await supabase
      .from('campaign_contacts')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', campaignContact.id);
    await supabase
      .from('campaigns')
      .update({ failed: (campaign.failed ?? 0) + 1 })
      .eq('id', campaign.id);
    logger.error('Falha ao enviar', { orgId, message: err.message });
    await checkAntibanRisk(supabase, orgId, sock);
  }
}

// orgId -> true enquanto já marcamos bloqueio nessa sessão em memória —
// evita marcar de novo a cada envio seguinte antes do worker reiniciar a
// conexão (mark_webjs_blocked já é idempotente-ish, mas não tem por que
// bater no banco toda hora).
const antibanBlockedThisSession = new Set();

// orgId -> true enquanto o timelock atual já foi tratado (campanhas pausadas
// e aviso gravado). Zera quando o WhatsApp libera, pra que um timelock NOVO
// depois volte a avisar.
const timelockHandled = new Set();

// ---------------------------------------------------------------------------
// AVISO ANTECIPADO — erro 463 (reach-out time-lock)
// ---------------------------------------------------------------------------
// Esse é o ÚNICO sinal que chega ANTES da conta ser restringida: o WhatsApp
// bloqueia iniciar conversa com desconhecido mas mantém a sessão conectada e
// continua entregando pra quem já conversou antes. Se a gente parar aqui, o
// cliente não chega no bloqueio de 24h.
//
// Por que NÃO dá pra usar o score de risco da baileys-antiban pra isso
// (verificado lendo a fonte da lib, v4.10.0, em 2026-09-11):
//   - health.js:103 pontua o 463 com +25 FIXO (não multiplica por
//     quantidade, diferente do 403 que é 40 * quantidade);
//   - o nosso corte de ação é 'high', que começa em 40;
//   - 25 < 40, então NENHUMA quantidade de 463 sozinha chega em 'high' —
//     é impossível por construção, não é questão de calibrar o limiar;
//   - e o decaimento de evento não-severo é 5 pts/min (health.js:127),
//     então os 25 pontos somem em 5 minutos, antes de somar com qualquer
//     outra coisa (nosso delay curto é 35-80s).
//
// Por isso lemos o estado do timelock DIRETO, que é público
// (timelockGuard.d.ts: { isActive, enforcementType, expiresAt, errorCount }),
// sem depender do score.
//
// Importante: NÃO marca a sessão como 'blocked'. A conta ainda está
// conectada e o timelock costuma durar minutos/horas, não 24h — marcar
// bloqueio aqui trancaria o cliente fora à toa. Pausa a campanha e avisa.
//
// A campanha NÃO volta sozinha quando o timelock passa, de propósito: retomar
// no mesmo ritmo que causou a restrição é o caminho mais curto pro bloqueio de
// 24h. Quem decide voltar (e quando) é o dono da conta.
async function checkTimelock(supabase, orgId, sock) {
  const state = sock.antiban?.timelock?.getState?.();

  if (!state?.isActive) {
    timelockHandled.delete(orgId);
    return false;
  }

  if (timelockHandled.has(orgId)) return true; // já pausado, não repete escrita
  timelockHandled.add(orgId);

  // Pausa TODAS as campanhas em andamento da org, imediatamente.
  const { data: paused } = await supabase
    .from('campaigns')
    .update({ status: 'paused' })
    .eq('org_id', orgId)
    .eq('status', 'sending')
    .select('id');

  const expira = state.expiresAt ? new Date(state.expiresAt).toLocaleString('pt-BR') : 'desconhecido';
  const aviso =
    `O WhatsApp acabou de restringir o envio para contatos NOVOS neste número ` +
    `(erro 463${state.enforcementType ? ` — ${state.enforcementType}` : ''}). ` +
    `O disparo foi pausado automaticamente. Conversas já existentes continuam ` +
    `funcionando normalmente. Previsão de liberar: ${expira}. ` +
    `Continuar disparando agora é o que transforma isso em bloqueio de 24h.`;

  await supabase.from('webjs_sessions').update({ last_error: aviso }).eq('org_id', orgId);

  logger.warn('TIMELOCK 463 — disparo pausado ANTES do bloqueio', {
    orgId,
    campanhasPausadas: paused?.length ?? 0,
    enforcementType: state.enforcementType,
    errorCount: state.errorCount,
    expiresAt: state.expiresAt,
  });

  return true;
}

// Consulta o risco calculado pela baileys-antiban (combina erros 403,
// desconexões e falhas recentes num score). Cobre o caso em que o WhatsApp
// NÃO deu aviso prévio — o 463 é tratado separado em checkTimelock, porque
// nunca consegue mover esse score sozinho (ver comentário acima).
async function checkAntibanRisk(supabase, orgId, sock) {
  // Aproveita o mesmo ponto de toque (roda a cada envio) pra também salvar
  // o progresso de aquecimento — sobrevive a queda brusca do processo, não
  // só a desligamento gracioso.
  await sessionManager.saveWarmupState(supabase, orgId);

  // Aviso antecipado primeiro: roda logo depois do envio que gerou o 463,
  // então a campanha já sai pausada antes do próximo disparo.
  if (await checkTimelock(supabase, orgId, sock)) return;

  if (antibanBlockedThisSession.has(orgId)) return;
  const stats = sock.antiban?.getStats?.();
  const risk = stats?.health?.risk;
  if (risk === 'high' || risk === 'critical') {
    antibanBlockedThisSession.add(orgId);
    const reasons = stats.health.reasons?.join('; ') || 'sinais combinados de risco elevado';
    // 'risk' (não 'confirmed'): isso é um INDÍCIO calculado pela
    // baileys-antiban, não uma confirmação do WhatsApp — a tela mostra um
    // aviso diferente pra não passar certeza que não temos (pedido do
    // dono, 2026-08-27).
    await sessionManager.markBlocked(
      supabase,
      orgId,
      `Indícios de risco elevado de bloqueio detectados (${reasons}).`,
      'risk',
    );
    logger.warn('Disparo pausado por precaução — risco antiban elevado', { orgId, risk, reasons });
    return;
  }

  await checkNonResponseRisk(supabase, orgId);
}

// orgId -> quando foi a última vez que rodamos a checagem de "% sem
// resposta" — de propósito NÃO roda a cada mensagem (pesquisa mostrou que é
// o sinal mais forte que existe, mas consultar o banco a cada envio custa
// caro no Supabase durante um disparo grande; 10 em 10 min é suficiente pra
// pegar a tendência sem pesar no rate limit).
const nonResponseCheckState = new Map();
const NON_RESPONSE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const NON_RESPONSE_MIN_SAMPLE = 20; // amostra pequena demais não é confiável, não arrisca pausar à toa
const NON_RESPONSE_WINDOW = 100; // olha só o disparo mais recente, não o histórico inteiro

// 2026-08-31 (pesquisa do dono, ver STATUS.md): o sinal mais citado pela
// comunidade como precursor real de bloqueio é a taxa de gente que NUNCA
// responde — e isso não entrava no cálculo de risco até agora (só olhava
// erro 403/463/desconexão). Mede, dos últimos envios de campanha (mais de
// 24h atrás — dá tempo da pessoa responder antes de contar contra ela), quantos
// contatos nunca mandaram nenhuma mensagem de volta.
async function getNonResponseRiskPct(supabase, orgId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sends, error } = await supabase
    .from('campaign_contacts')
    .select('contact_id, sent_at')
    .eq('org_id', orgId)
    .in('status', ['sent', 'delivered', 'read'])
    .not('sent_at', 'is', null)
    .lte('sent_at', cutoff)
    .order('sent_at', { ascending: false })
    .limit(NON_RESPONSE_WINDOW);
  if (error || !sends || sends.length < NON_RESPONSE_MIN_SAMPLE) return null;

  const contactIds = [...new Set(sends.map((s) => s.contact_id))];
  const { data: convRows } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('org_id', orgId)
    .in('contact_id', contactIds);
  const contactByConv = new Map((convRows || []).map((c) => [c.id, c.contact_id]));
  const convIds = [...contactByConv.keys()];

  const respondedContacts = new Set();
  if (convIds.length > 0) {
    const { data: inboundRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .eq('direction', 'inbound');
    for (const row of inboundRows || []) {
      const contactId = contactByConv.get(row.conversation_id);
      if (contactId) respondedContacts.add(contactId);
    }
  }

  const total = sends.length;
  const noResponse = sends.filter((s) => !respondedContacts.has(s.contact_id)).length;
  const pct = Math.round((noResponse / total) * 1000) / 10;
  return { total, noResponse, pct };
}

async function checkNonResponseRisk(supabase, orgId) {
  const last = nonResponseCheckState.get(orgId) || 0;
  if (Date.now() - last < NON_RESPONSE_CHECK_INTERVAL_MS) return;
  nonResponseCheckState.set(orgId, Date.now());

  const result = await getNonResponseRiskPct(supabase, orgId);
  if (!result) return;

  if (result.pct >= 90) {
    if (antibanBlockedThisSession.has(orgId)) return;
    antibanBlockedThisSession.add(orgId);
    await sessionManager.markBlocked(
      supabase,
      orgId,
      `${result.pct}% dos últimos ${result.total} contatos alcançados nunca responderam nada — esse é o sinal mais forte de risco de bloqueio.`,
      'risk',
    );
    logger.warn('Disparo pausado por precaução — taxa de não-resposta muito alta', result);
  } else if (result.pct >= 70) {
    logger.warn('Engajamento baixo nos envios recentes — ainda não pausando', result);
  }
}

// Processa NO MÁXIMO 1 envio por org por chamada — o próprio ritmo (delay
// curto/médio/longo) é o que naturalmente espaça as chamadas seguintes,
// igual ao motor original do Disparador-WPP.
async function processOrgOnce(supabase, orgId) {
  const state = getState(orgId);
  const now = Date.now();
  if (now < state.nextAllowedAt) return;
  if (!isWithinWorkingWindow()) return;

  // Reconstrução de confiança do chip: se a org foi bloqueada recentemente,
  // usa um limite diário bem mais baixo até a janela de recuperação passar
  // (whatsapp_hub.mark_webjs_blocked calcula quanto tempo/quanto limite,
  // escalando conforme quantas vezes já bloqueou).
  const plan = await getOrgPlan(supabase, orgId);
  const cfg = plan === 'bot' ? defaultsConfig() : await getDispatchConfig(supabase, orgId);
  const effectiveDailyLimit = await getEffectiveDailyLimit(supabase, orgId, plan, cfg);
  // Traz do banco o que já foi enviado hoje (sobrevive a reinício do worker).
  await hidratarContadorDiario(supabase, orgId, state);
  if (state.sentToday >= effectiveDailyLimit) return;
  if (!(await isOrgAllowedToSend(supabase, orgId))) return;

  const sock = sessionManager.getSocket(orgId);
  if (!sock) return;

  // Trava de segurança ANTES de qualquer envio: se o WhatsApp restringiu
  // contato novo (463), nenhuma mensagem de campanha sai daqui. Dupla
  // checagem de propósito — a outra roda logo após cada envio
  // (checkAntibanRisk), esta garante que nem o primeiro envio do próximo
  // ciclo escapa.
  if (await checkTimelock(supabase, orgId, sock)) return;

  // Delay tipo 3 (longo) tem prioridade sobre o tipo 2.
  if (state.sinceLongo >= state.nextLongoThreshold) {
    const pauseMin = randomBetween(cfg.delayLongoMinMinutes, cfg.delayLongoMaxMinutes);
    state.sinceLongo = 0;
    state.nextLongoThreshold = pickThreshold(cfg.delayLongoACadaMensagens, DEFAULTS.delayLongoACadaMensagensJitter);
    state.sinceMedio = 0;
    state.nextMedioThreshold = pickThreshold(cfg.delayMedioACadaMensagens, DEFAULTS.delayMedioACadaMensagensJitter);
    state.nextAllowedAt = now + pauseMin * 60000;
    logger.info(`Delay longo: ${pauseMin.toFixed(1)}min`, { orgId });
    return;
  }
  if (state.sinceMedio >= state.nextMedioThreshold) {
    const pauseMin = randomBetween(cfg.delayMedioMinMinutes, cfg.delayMedioMaxMinutes);
    state.sinceMedio = 0;
    state.nextMedioThreshold = pickThreshold(cfg.delayMedioACadaMensagens, DEFAULTS.delayMedioACadaMensagensJitter);
    state.nextAllowedAt = now + pauseMin * 60000;
    logger.info(`Delay médio: ${pauseMin.toFixed(1)}min`, { orgId });
    return;
  }

  // BUG REAL (2026-09-11): campanha AGENDADA nunca disparava. A UI grava
  // status 'scheduled' + scheduled_at (useCampaigns.ts), o worker só busca
  // 'sending', e o cron que promovia scheduled→sending foi desagendado em
  // 2026-08-22 (o comentário em CampaignWizard.tsx ficou órfão, dizendo que
  // o cron existia). Resultado: o cliente agendava, o sistema aceitava e
  // mostrava a campanha criada, e não enviava nada — sem erro nenhum.
  //
  // Promovido aqui em vez de recriar o cron: o worker já roda a cada 5s e é
  // quem realmente envia, então não há como a promoção acontecer e o envio
  // não seguir. Menos peça pra dar errado.
  const agoraIso = new Date().toISOString();
  const { data: agendadasVencidas } = await supabase
    .from('campaigns')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'scheduled')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', agoraIso);

  if (agendadasVencidas?.length) {
    await supabase
      .from('campaigns')
      .update({ status: 'sending', started_at: agoraIso })
      .in('id', agendadasVencidas.map((c) => c.id));
    logger.info('Campanha agendada chegou a hora — liberada pra envio', {
      orgId,
      quantidade: agendadasVencidas.length,
    });
  }

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, template_id, channel_id, sent, failed, variable_mapping')
    .eq('org_id', orgId)
    .eq('status', 'sending');
  if (!campaigns?.length) return;

  const { data: channels } = await supabase.from('channels').select('id').eq('org_id', orgId).eq('provider', 'webjs');
  const webjsChannelIds = new Set((channels ?? []).map((c) => c.id));
  const webjsCampaigns = campaigns.filter((c) => webjsChannelIds.has(c.channel_id));
  if (!webjsCampaigns.length) return;

  for (const campaign of webjsCampaigns) {
    const { data: pendingContact } = await supabase
      .from('campaign_contacts')
      .select('id, contact_id')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pendingContact) {
      // Sem mais pendentes nessa campanha: fecha ela.
      await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaign.id);
      continue;
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone, name, custom_fields')
      .eq('id', pendingContact.contact_id)
      .maybeSingle();
    if (!contact) continue;

    const { data: template } = await supabase.from('templates').select('body').eq('id', campaign.template_id).maybeSingle();
    if (!template) continue;

    await sendToContact({ supabase, orgId, sock, campaign, campaignContact: pendingContact, contact, templateBody: template.body, state });
    // Em recuperação, dobra o delay curto — reconstruir confiança pede mais
    // espaçamento, não só menos mensagens por dia. Compara com o limite BASE
    // DO PLANO (não o global 150) pra não confundir "está em recuperação"
    // com "é plano Bot" — são dois multiplicadores independentes, aplicados
    // juntos quando os dois casos coincidem.
    const planBaseline = plan === 'bot' ? DEFAULTS.dailyLimitBotPlan : cfg.dailyLimit;
    const recoveryMultiplier = effectiveDailyLimit < planBaseline ? 2 : 1;
    const planMultiplier = plan === 'bot' ? DEFAULTS.botPlanDelayMultiplier : 1;
    state.nextAllowedAt =
      Date.now() +
      randomBetween(cfg.delayCurtoMinSeconds, cfg.delayCurtoMaxSeconds) * 1000 * recoveryMultiplier * planMultiplier;
    return;
  }
}

// A simulação de digitação sozinha pode levar até 6s (DEFAULTS.maxTypingMs) —
// mais o tempo de rede, um envio pode facilmente passar do intervalo de 5s
// entre chamadas de tick(). Sem essa trava, dois tick() se sobrepondo
// poderiam processar a MESMA org ao mesmo tempo (duas mensagens quase
// simultâneas pro mesmo contato, ou o motor "pulando" o delay curto).
let tickRunning = false;

async function tick(supabase) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    for (const orgId of sessionManager.activeOrgIds()) {
      try {
        await processOrgOnce(supabase, orgId);
      } catch (err) {
        logger.error('Erro processando org', { orgId, message: err.message });
      }
    }
  } finally {
    tickRunning = false;
  }
}

// Chamado pelo sessionManager quando a org reconecta com sucesso (socket
// novo = AntiBan novo = risco reseta) — sem isso, depois do 1º bloqueio
// nunca mais detectaríamos risco alto de novo pra essa org nesse processo.
function clearAntibanGuard(orgId) {
  antibanBlockedThisSession.delete(orgId);
  timelockHandled.delete(orgId);
}

module.exports = { tick, clearAntibanGuard };
