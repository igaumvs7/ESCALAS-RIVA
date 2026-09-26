import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { SupabaseProvider } from './app/providers/SupabaseProvider';
import { AuthProvider } from './app/providers/AuthProvider';
import { AppUserProvider } from './app/providers/AppUserProvider';
import { ConfirmProvider } from './app/providers/ConfirmProvider';
import { WebjsSessionProvider } from './app/providers/WebjsSessionProvider';
import { AppRouter } from './app/router';
import { Toaster } from './components/ui/sonner';

export default function App() {
  return (
    <SupabaseProvider>
      <AuthProvider>
        <AppUserProvider>
          <ThemeProvider>
            <ConfirmProvider>
              <WebjsSessionProvider>
                <BrowserRouter>
                  <AppRouter />
                  <Toaster />
                </BrowserRouter>
              </WebjsSessionProvider>
            </ConfirmProvider>
          </ThemeProvider>
        </AppUserProvider>
      </AuthProvider>
    </SupabaseProvider>
  );
}
