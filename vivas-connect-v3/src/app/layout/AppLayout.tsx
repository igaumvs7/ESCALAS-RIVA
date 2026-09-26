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
    <div className="h-screen flex overflow-hidden v3-shell-bg">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <SupportBanner />
        <FeedbackPromptBanner />
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6" role="main">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <RobotLoader size={48} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
