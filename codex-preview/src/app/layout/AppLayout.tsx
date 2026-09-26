import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { SupportBanner } from './SupportBanner';
import { FeedbackPromptBanner } from './FeedbackPromptBanner';
import { RobotLoader } from '@/components/ui/RobotLoader';

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // h-screen + overflow-hidden aqui (em vez de min-h-screen) é o que faz o
    // <main> rolar SOZINHO por dentro — sem isso o documento inteiro cresce
    // com o conteúdo e rola junto, levando a sidebar/header embora junto com
    // a página (bug relatado: "barra lateral não fica fixa com o scroll").
    <div className="app-shell h-screen flex overflow-hidden">
      <div className="app-ambient app-ambient-primary" aria-hidden="true" />
      <div className="app-ambient app-ambient-secondary" aria-hidden="true" />
      <Sidebar />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="app-stage flex-1 flex flex-col min-w-0 h-full">
        <SupportBanner />
        <FeedbackPromptBanner />
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="app-content-scroll flex-1 min-h-0 overflow-y-auto" role="main">
          {/* Suspense SÓ aqui dentro (não mais envolvendo o app inteiro em
              router.tsx) — uma página lazy ainda não carregada agora só
              suspende o próprio conteúdo, sem derrubar Sidebar/Header, que
              ficam fora desse boundary. */}
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <RobotLoader size={48} />
              </div>
            }
          >
            <div className="app-content-frame">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
