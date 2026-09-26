import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { useSupabaseConfig } from '@/hooks/useSupabase';
import { useAuth } from './providers/AuthProvider';
import { useAppUser } from './providers/AppUserProvider';
import { useSubscription } from '@/hooks/useSubscription';
import { PlanUpgradeRequired } from '@/components/billing/PlanUpgradeRequired';
import { RequireActiveSubscription } from './components/billing/SubscriptionGate';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { RobotLoader } from '@/components/ui/RobotLoader';

// Lazy loading the page chunks keeps the initial bundle lean.
const SetupPage = lazy(() => import('./routes/setup/SetupPage'));
const LoginPage = lazy(() => import('./routes/auth/LoginPage'));
const SignupPage = lazy(() => import('./routes/auth/SignupPage'));
const InvitePage = lazy(() => import('./routes/invite/InvitePage'));
const DashboardPage = lazy(() => import('./routes/dashboard/DashboardPage'));
const InboxPage = lazy(() => import('./routes/inbox/InboxPage'));
const ContactsPage = lazy(() => import('./routes/contacts/ContactsPage'));
const ContactDetailPage = lazy(() => import('./routes/contacts/ContactDetailPage'));
const PlansPage = lazy(() => import('./routes/plans/PlansPage'));
const VivasPerfilPage = lazy(() => import('./routes/vivas-perfil/VivasPerfilPage'));
const VivasEnviaPage = lazy(() => import('./routes/vivas-envia/VivasEnviaPage'));
const AIAgentPage = lazy(() => import('./routes/ai-agent/AIAgentPage'));
const HelpPage = lazy(() => import('./routes/help/HelpPage'));
const FeedbackPage = lazy(() => import('./routes/feedback/FeedbackPage'));
const SettingsPage = lazy(() => import('./routes/settings/SettingsPage'));
const AdminPage = lazy(() => import('./routes/admin/AdminPage'));
const ToolsPage = lazy(() => import('./routes/tools/ToolsPage'));
const PublicAgentSitePage = lazy(() => import('./routes/public/PublicAgentSitePage'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <RobotLoader size={48} />
    </div>
  );
}

function RequireSetup({ children }: { children: ReactElement }) {
  const { configured } = useSupabaseConfig();
  const location = useLocation();
  if (!configured) {
    return <Navigate to="/setup" state={{ from: location.pathname }} replace />;
  }
  return children;
}

function RequireSession({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageFallback />;
  if (!session) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

// Rotas restritas a admin: operador é levado para a Inbox.
function AdminOnly({ children }: { children: ReactElement }) {
  const { role, loading } = useAppUser();
  if (loading) return <PageFallback />;
  if (role !== 'admin') {
    return <Navigate to="/inbox" replace />;
  }
  return children;
}

// Recursos exclusivos do Plano Jarvis (Vivas Perfil, Agente de IA) — bloqueia
// acesso direto pela URL mesmo com o item escondido do menu no Plano Bot.
// Org isenta de billing (subscription null) não é afetada.
function RequireJarvisPlan({ children }: { children: ReactElement }) {
  const { subscription, loading } = useSubscription();
  if (loading) return <PageFallback />;
  if (subscription?.plan === 'bot') {
    return <PlanUpgradeRequired />;
  }
  return children;
}

// Console /admin: restrito ao super admin. Demais usuários vão pro dashboard.
function RequireSuperAdmin({ children }: { children: ReactElement }) {
  const { isSuperAdmin, loading } = useAppUser();
  if (loading) return <PageFallback />;
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function RedirectIfConfigured({ children }: { children: ReactElement }) {
  const { configured } = useSupabaseConfig();
  const { session } = useAuth();
  const location = useLocation();
  const setupStep = new URLSearchParams(location.search).get('step');
  if (configured) {
    if (location.pathname === '/setup' && setupStep === '4') {
      return children;
    }
    // Already configured → move the user forward. If they also have a
    // session, jump straight to dashboard; otherwise to login.
    return <Navigate to={session ? '/dashboard' : '/auth/login'} replace />;
  }
  return children;
}

function RedirectIfAuthenticated({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

// Campanhas virou aba dentro de Vivas Envia (2026-08-27) — preserva
// ?tab= de links salvos/compartilhados de /campaigns em vez de jogar tudo
// pra aba padrão (Conexão).
function RedirectCampaignsToVivasEnvia() {
  const location = useLocation();
  return <Navigate to={`/vivas-envia${location.search}`} replace />;
}

export function AppRouter() {
  // Cada rota "solta" (fora do AppLayout) carrega o próprio Suspense — do
  // jeito que estava antes, um Suspense SÓ no topo envolvendo <Routes>
  // inteiro fazia qualquer página lazy ainda não carregada (troca de aba
  // pra uma seção nunca visitada nessa sessão) suspender e derrubar a
  // ÁRVORE INTEIRA sob esse boundary — incluindo Sidebar/Header, que estão
  // fora do <Outlet/> mas dentro desse mesmo Suspense. Isso desmontava e
  // remontava a sidebar a cada navegação pra uma página nova, causando bugs
  // de estado visual nela (relatado: "abre, clica em algo, e a sidebar
  // volta a ficar toda junta"). Agora o Suspense da área logada fica só em
  // volta do <Outlet/> (dentro do AppLayout) — a sidebar nunca mais
  // desmonta por causa de carregamento de página.
  return (
    <ChunkErrorBoundary>
      <Routes>
        <Route
          path="/setup"
          element={
            <Suspense fallback={<PageFallback />}>
              <RedirectIfConfigured>
                <SetupPage />
              </RedirectIfConfigured>
            </Suspense>
          }
        />

        <Route
          path="/auth/login"
          element={
            <Suspense fallback={<PageFallback />}>
              <RequireSetup>
                <RedirectIfAuthenticated>
                  <LoginPage />
                </RedirectIfAuthenticated>
              </RequireSetup>
            </Suspense>
          }
        />
        <Route
          path="/auth/signup"
          element={
            <Suspense fallback={<PageFallback />}>
              <RequireSetup>
                <RedirectIfAuthenticated>
                  <SignupPage />
                </RedirectIfAuthenticated>
              </RequireSetup>
            </Suspense>
          }
        />
        {/* /invite NÃO usa RedirectIfAuthenticated: o link de convite do
            Supabase estabelece uma sessão, e o convidado precisa dela aberta
            para definir a senha (updateUser) antes de seguir para o app. */}
        <Route
          path="/invite"
          element={
            <Suspense fallback={<PageFallback />}>
              <RequireSetup>
                <InvitePage />
              </RequireSetup>
            </Suspense>
          }
        />
        {/* Perfil público do corretor (VIVAS) — sem sessão, de propósito,
            igual /invite: qualquer visitante da internet acessa. */}
        <Route
          path="/c/:slug"
          element={
            <Suspense fallback={<PageFallback />}>
              <RequireSetup>
                <PublicAgentSitePage />
              </RequireSetup>
            </Suspense>
          }
        />

        {/* Planos — pedido do dono (2026-09-06): "eu quero que a tela inteira
            seja tudo apenas sobre os planos aí apenas com o botão de
            voltar". Já era uma página própria (PlansPage, com seta de
            voltar), mas continuava DENTRO do AppLayout — sidebar/header
            apareciam em volta mesmo assim. Fora do grupo do AppLayout, igual
            /setup e /auth/login: tela cheia de verdade, sem menu nenhum.
            Sem RequireActiveSubscription de propósito — é justamente a
            página que resolve uma assinatura bloqueada/pendente, não faria
            sentido ela mesma exigir assinatura ativa pra abrir. */}
        <Route
          path="/planos"
          element={
            <Suspense fallback={<PageFallback />}>
              <RequireSetup>
                <RequireSession>
                  <AdminOnly>
                    <PlansPage />
                  </AdminOnly>
                </RequireSession>
              </RequireSetup>
            </Suspense>
          }
        />

        <Route
          element={
            <RequireSetup>
              <RequireSession>
                <RequireActiveSubscription>
                  <AppLayout />
                </RequireActiveSubscription>
              </RequireSession>
            </RequireSetup>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <AdminOnly>
                <DashboardPage />
              </AdminOnly>
            }
          />
          <Route path="/inbox" element={<InboxPage />} />
          {/* Campanhas virou aba dentro de Vivas Envia (2026-08-27) — preserva links salvos. */}
          <Route path="/campaigns" element={<RedirectCampaignsToVivasEnvia />} />
          {/* Templates virou aba dentro de Vivas Envia (antes: Campanhas, Módulo 1). */}
          <Route path="/templates" element={<Navigate to="/vivas-envia?tab=templates" replace />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route
            path="/vivas-perfil"
            element={
              <AdminOnly>
                <RequireJarvisPlan>
                  <VivasPerfilPage />
                </RequireJarvisPlan>
              </AdminOnly>
            }
          />
          <Route
            path="/vivas-envia"
            element={
              <AdminOnly>
                <VivasEnviaPage />
              </AdminOnly>
            }
          />
          {/* Funil (pipeline com valor em R$) removido — o produto virou
              focado em leads/atendimento, não vendas. Redireciona pro dashboard. */}
          <Route path="/funil" element={<Navigate to="/dashboard" replace />} />
          {/* /vendas (Vendas & Recompra) removido — redireciona pro dashboard */}
          <Route path="/vendas" element={<Navigate to="/dashboard" replace />} />
          {/* /projetos (Entrega) e /educacao removidos — redirecionam pro dashboard */}
          <Route path="/projetos" element={<Navigate to="/dashboard" replace />} />
          <Route path="/educacao" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/ai-agent"
            element={
              <RequireJarvisPlan>
                <AIAgentPage />
              </RequireJarvisPlan>
            }
          />
          <Route path="/ferramentas" element={<ToolsPage />} />
          <Route path="/ajuda" element={<HelpPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          {/* Rotas antigas → agora abas dentro de /ai-agent */}
          <Route path="/knowledge" element={<Navigate to="/ai-agent" replace />} />
          {/* Automações (Funil-etapa + follow-up Zernio/UAZAPI) removida — o
              Funil saiu do produto e o follow-up automático foi substituído
              pelo relatório manual "Não responderam" em Campanhas. */}
          <Route path="/automations" element={<Navigate to="/dashboard" replace />} />
          <Route path="/follow-ups" element={<Navigate to="/vivas-envia?tab=nao_responderam" replace />} />
          <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
          <Route path="/settings/profile" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={
              <RequireSuperAdmin>
                <AdminPage />
              </RequireSuperAdmin>
            }
          />
          {/* Credenciais agora é aba dentro de Configurações */}
          <Route
            path="/settings/credentials"
            element={<Navigate to="/settings/profile" replace />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ChunkErrorBoundary>
  );
}
