import {
  LayoutDashboard,
  Inbox,
  Users,
  Bot,
  Settings,
  Globe,
  Send,
  Building2,
  Wrench,
  HelpCircle,
  MessageSquareHeart,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Itens adminOnly só aparecem para role 'admin'. Operadores não veem
  // Credenciais (escrita admin-only — antes a rota existia mas sem link,
  // deixando Configurações/Equipe/Conta inalcançáveis pela UI).
  adminOnly?: boolean;
  // Itens superAdminOnly só aparecem para o super admin da instância
  // (JWT is_super_admin). Ex.: console de Organizações (/admin).
  superAdminOnly?: boolean;
  // Recurso exclusivo do Plano Jarvis (ver src/lib/plans.ts) — some do menu
  // pra organizações no Plano Bot. Orgs isentas de billing (subscription
  // null) NÃO são afetadas por essa flag — ver filtro em Sidebar/MobileNav.
  requiresJarvis?: boolean;
  // Só aparece depois que a conta atingiu X horas de criada (ver
  // FEEDBACK_UNLOCK_HOURS abaixo) — hoje só usado por /feedback.
  requiresOrgAgeHours?: number;
}

// Pedido do dono (2026-09-05): "a pessoa só tem direito a fazer uma
// avaliação... acredito que essa aba de avaliações só deveria ser liberada
// ao cliente depois de 1 dia ou algumas horas de uso... depois de x tempo
// essa aba libera pra pessoa e fica uma notificação". 24h de conta criada —
// o convite automático (job `wh-feedback-unlock-prompt`, ver migração
// 20260905140000) usa o MESMO número, pra a notificação e o item do menu
// aparecerem juntos.
export const FEEDBACK_UNLOCK_HOURS = 24;

export function isOrgOldEnough(orgCreatedAt: string | null, hours: number): boolean {
  if (!orgCreatedAt) return false;
  return Date.now() - new Date(orgCreatedAt).getTime() >= hours * 60 * 60 * 1000;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Single source of truth for both the Sidebar e o MobileNav. Adding a new
// app section is a one-liner aqui. Agrupado por tópico (pedido do dono,
// 2026-08-24) — antes era uma lista só, sem hierarquia visual nenhuma.
// Base de Conhecimento, Follow-ups e Horário de atendimento viraram abas dentro
// de /ai-agent. Credenciais virou aba dentro de Configurações. Campanhas
// (com Templates, Métricas, Não responderam e UTMs) deixou de ser item
// próprio da sidebar em 2026-08-27 e virou aba dentro de Vivas Envia — pedido
// do dono ("e para tudo ficar na aba de VIVAS ENVIA"), já que o disparo em
// massa É o Vivas Envia.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
      { to: '/inbox', label: 'Inbox', icon: Inbox },
    ],
  },
  {
    label: 'Vivas',
    items: [
      { to: '/vivas-envia', label: 'Vivas Envia', icon: Send, adminOnly: true },
      { to: '/vivas-perfil', label: 'Vivas Perfil', icon: Globe, adminOnly: true, requiresJarvis: true },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { to: '/contacts', label: 'Contatos', icon: Users },
      { to: '/ai-agent', label: 'Agente de IA', icon: Bot, adminOnly: true, requiresJarvis: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/ferramentas', label: 'Ferramentas', icon: Wrench },
      { to: '/settings/profile', label: 'Configurações', icon: Settings },
      { to: '/feedback', label: 'Feedback', icon: MessageSquareHeart, requiresOrgAgeHours: FEEDBACK_UNLOCK_HOURS },
      { to: '/ajuda', label: 'Ajuda', icon: HelpCircle },
      { to: '/admin', label: 'Organizações', icon: Building2, superAdminOnly: true },
    ],
  },
];

// Lista achatada — mantida pra quem só precisa saber "quais rotas existem",
// sem se importar com agrupamento (ex.: nenhum consumidor hoje, mas evita
// duplicar a fonte de verdade se aparecer um).
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
