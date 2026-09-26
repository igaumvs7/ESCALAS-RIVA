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
          {/* ThemeProvider precisa ficar DENTRO de AppUserProvider — o tema
              agora é preferência da conta (whatsapp_hub.app_users.theme),
              não só do navegador, e só existe useAppUser() aqui dentro. */}
          <ThemeProvider>
            {/* ConfirmProvider substitui window.confirm() nativo (feedback do
                dono: "isso eu acho muito amador") por um diálogo no visual do
                sistema — ver useConfirm() em qualquer tela que precise
                confirmar uma ação. */}
            <ConfirmProvider>
              {/* Estado da sessão webjs (QR/conectado/desconectado) compartilhado
                  entre ConnectionStatusBar, WebjsSettings e VivasEnviaPage — ver
                  comentário no arquivo do provider. */}
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
