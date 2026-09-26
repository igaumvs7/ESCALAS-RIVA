// Definição central dos planos VIVAS CONNECT — única fonte de verdade pra
// preço/recursos em toda a UI (tela pós-cadastro, Configurações > Assinatura,
// e futuramente o site institucional). Nunca hardcodear preço/nome de plano
// em outro lugar — importar daqui.

import {
  Zap,
  MessageSquareText,
  Users,
  BarChart3,
  Bot,
  Globe,
  GraduationCap,
  Inbox,
  Infinity as InfinityIcon,
  type LucideIcon,
} from 'lucide-react';

export type PlanId = 'bot' | 'jarvis';

export interface PlanFeature {
  icon: LucideIcon;
  text: string;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  regularPriceCents: number;
  launchPriceCents: number;
  // Selo curto no topo do card (pedido do dono: "elementos legais" — dá pra
  // ler o "clima" do plano de relance, antes mesmo do preço).
  badge: string;
  features: PlanFeature[];
  // Limitações não ganham ícone próprio — usa um traço consistente
  // (ver PlanCard) pra não competir visualmente com os recursos incluídos.
  limitations: string[];
}

// Preço de lançamento — temporário, por tempo limitado (comunicado na UI).
// Quando terminar a promoção, virar LAUNCH_PRICING_ACTIVE = false: a UI passa
// a mostrar regularPriceCents como preço único, sem risco de mexer em quem
// já é assinante (o valor cobrado de cada organização já fica travado em
// whatsapp_hub.subscriptions.plan_price_cents no momento da assinatura).
export const LAUNCH_PRICING_ACTIVE = true;

export const PLANS: PlanDef[] = [
  {
    id: 'bot',
    name: 'Plano Bot',
    tagline: 'Só o disparo em massa, no seu ritmo.',
    badge: 'Essencial',
    regularPriceCents: 4790,
    launchPriceCents: 2990,
    features: [
      { icon: Zap, text: 'Disparo em massa no WhatsApp (Vivas Envia)' },
      { icon: MessageSquareText, text: 'Templates de mensagem com ajuda de IA' },
      { icon: Users, text: 'Contatos, tags e relatório de não responderam' },
      { icon: BarChart3, text: 'Dashboard de leads' },
      { icon: Inbox, text: 'Inbox manual — vê e responde quem respondeu ao disparo' },
      { icon: GraduationCap, text: 'Professor Resposta — IA que reescreve sua mensagem com técnica de venda' },
    ],
    limitations: [
      'Até 60 mensagens/dia (ritmo fixo, sem ajuste)',
      'Delay entre mensagens ~50% mais longo que o modo seguro do Jarvis',
      'Sem Agente de IA respondendo sozinho no WhatsApp',
      'Sem Vivas Perfil (site público)',
    ],
  },
  {
    id: 'jarvis',
    name: 'Plano Jarvis',
    tagline: 'O sistema completo, sem limites.',
    badge: 'Completo',
    regularPriceCents: 12790,
    launchPriceCents: 6990,
    features: [
      { icon: InfinityIcon, text: 'Tudo do Plano Bot, sem os limites de ritmo/volume' },
      { icon: Zap, text: 'Até 150 mensagens/dia no modo seguro, até 250/dia no modo arriscado' },
      { icon: Bot, text: 'Agente de IA respondendo sozinho no WhatsApp, com base de conhecimento' },
      { icon: Globe, text: 'Vivas Perfil — site público com catálogo e botão de WhatsApp' },
      { icon: Inbox, text: 'A IA atende e filtra o cliente antes de te passar a conversa' },
      { icon: GraduationCap, text: 'Professor Resposta — IA que reescreve sua mensagem com técnica de venda' },
    ],
    limitations: [],
  },
];

// Tabela comparativa completa — pedido do dono na página de Planos ("quero
// todas as informações de cada um"). Números batendo com o que é realmente
// aplicado no código (ver webjs-worker/campaignWorker.js DEFAULTS/
// dailyLimitBotPlan/botPlanDelayMultiplier e useDispatchSettings.ts
// SAFE_PRESET/RISKY_PRESET) — nunca inventar número aqui sem checar o real.
export interface PlanComparisonRow {
  label: string;
  bot: string;
  jarvis: string;
}

export const PLAN_COMPARISON: PlanComparisonRow[] = [
  { label: 'Disparo em massa no WhatsApp', bot: 'Sim', jarvis: 'Sim' },
  { label: 'Limite de mensagens por dia', bot: '60/dia (fixo)', jarvis: '150/dia (padrão) até 250/dia (modo arriscado)' },
  { label: 'Velocidade entre mensagens', bot: 'Delay ~50% mais longo, sem ajuste', jarvis: 'Ajustável — seguro, arriscado ou manual' },
  { label: 'Templates com ajuda de IA', bot: 'Sim', jarvis: 'Sim' },
  { label: 'Contatos, tags e relatório "não responderam"', bot: 'Sim', jarvis: 'Sim' },
  { label: 'Dashboard de leads', bot: 'Sim', jarvis: 'Sim' },
  { label: 'Inbox (ver e responder conversas)', bot: 'Sim, manual', jarvis: 'Sim — a IA atende e filtra antes de te passar a conversa' },
  { label: 'Agente de IA respondendo sozinho', bot: 'Não', jarvis: 'Sim' },
  { label: 'Base de conhecimento da IA (PDF, doc, link)', bot: 'Não', jarvis: 'Sim' },
  { label: 'Vivas Perfil (site público com catálogo)', bot: 'Não', jarvis: 'Sim' },
  { label: 'Professor Resposta (reescreve mensagem com técnica de venda)', bot: 'Sim, até 20 usos/dia', jarvis: 'Sim, até 20 usos/dia' },
];

export function getPlan(id: PlanId): PlanDef {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Plano desconhecido: ${id}`);
  return plan;
}

export function activePriceCents(plan: PlanDef): number {
  return LAUNCH_PRICING_ACTIVE ? plan.launchPriceCents : plan.regularPriceCents;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
