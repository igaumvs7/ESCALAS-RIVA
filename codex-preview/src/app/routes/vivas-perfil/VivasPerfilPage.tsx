import { Globe } from 'lucide-react';
import { AgentSiteSettings } from '@/app/routes/settings/sections/AgentSiteSettings';

// ----------------------------------------------------------------------------
// VivasPerfilPage — item próprio da barra lateral (antes vivia como aba
// dentro de Configurações). É a porta de entrada de lead novo: o corretor
// edita o próprio perfil público aqui, não é uma configuração administrativa.
// ----------------------------------------------------------------------------
export default function VivasPerfilPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <Globe className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Vivas Perfil</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Seu perfil público — de onde os leads chegam
          </p>
        </div>
      </div>

      <AgentSiteSettings />
    </div>
  );
}
