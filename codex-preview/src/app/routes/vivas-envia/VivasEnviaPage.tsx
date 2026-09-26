import { useSearchParams } from 'react-router-dom';
import { Send, Megaphone, FileText, BarChart3, UserX, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WebjsSettings } from '@/app/routes/settings/sections/WebjsSettings';
import { useWebjsSession } from '@/hooks/useWebjsSession';
import { CampaignsList } from '@/components/campaigns/CampaignsList';
import { TemplatesList } from '@/components/campaigns/TemplatesList';
import { DispatchMetrics } from '@/components/campaigns/DispatchMetrics';
import { UtmBuilder } from '@/components/campaigns/UtmBuilder';
import { UtmChannelMap } from '@/components/campaigns/UtmChannelMap';
import { NonRespondersTab } from '@/components/campaigns/NonRespondersTab';
import { AntiBlockGuide } from '@/components/vivas-envia/AntiBlockGuide';
import { DispatchSettingsPanel } from '@/components/vivas-envia/DispatchSettingsPanel';
import { QuickSendCard } from '@/components/vivas-envia/QuickSendCard';
import { ConnectionStatusBar } from '@/components/vivas-envia/ConnectionStatusBar';

// ----------------------------------------------------------------------------
// VivasEnviaPage — item único da barra lateral pra tudo que é conexão +
// disparo de WhatsApp. Absorve as abas que antes eram só de /campaigns; a
// antiga CampaignsPage/rota /campaigns foi removida e passa a redirecionar
// pra cá.
//
// Sem aba "Conexão" separada (removida 2026-08-27, pedido do dono: "a aba de
// conexão só diz que estou conectado, não é muito útil... a primeira aba tem
// que ser o disparador, não tem outra"). Antes de conectar, a tela inteira é
// o QR code (`<WebjsSettings/>`); depois de conectar, uma faixa fina no topo
// (`ConnectionStatusBar`) substitui a aba, e o disparador (Disparador) é a
// aba padrão.
//
// Origem dos leads deixou de ser aba própria (2026-08-27, pedido do dono) —
// virou seção dentro de Métricas (os dois são sobre desempenho de disparo).
// Templates teve o caminho inverso: chegou a virar seção dentro do
// Disparador na rodada anterior, mas o dono achou útil de outro jeito —
// "puxar o texto pronto" direto de CADA mensagem (botão de pasta no
// MessageVariantsEditor), então a gestão completa (criar/editar/apagar)
// voltou a ser aba própria, sem ocupar espaço no Disparador.
// ----------------------------------------------------------------------------
type TabId = 'campanhas' | 'templates' | 'metricas' | 'nao_responderam' | 'seguranca';

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: 'campanhas',
    label: 'Disparador',
    icon: Megaphone,
    render: () => (
      <div className="space-y-6">
        <QuickSendCard />
        <DispatchSettingsPanel />
        <div className="space-y-3">
          <h4 className="text-label">Histórico de disparos</h4>
          <CampaignsList />
        </div>
      </div>
    ),
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: FileText,
    render: () => <TemplatesList />,
  },
  {
    id: 'metricas',
    label: 'Métricas',
    icon: BarChart3,
    render: () => (
      <div className="space-y-6">
        <DispatchMetrics />
        <div className="space-y-3">
          <div>
            <h4 className="text-label">Origem dos leads</h4>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Pra saber ONDE gastar seu tempo/dinheiro divulgando: gera um link marcado pra cada
              lugar que você divulga (Instagram, anúncio pago, etc.) e mostra quantos leads vieram
              de cada um.
            </p>
          </div>
          <UtmBuilder />
          <UtmChannelMap />
        </div>
      </div>
    ),
  },
  { id: 'nao_responderam', label: 'Não responderam', icon: UserX, render: () => <NonRespondersTab /> },
  {
    id: 'seguranca',
    label: 'Segurança do chip',
    icon: ShieldCheck,
    render: () => <AntiBlockGuide />,
  },
];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export default function VivasEnviaPage() {
  const [params, setParams] = useSearchParams();
  const { session } = useWebjsSession();
  const connected = session?.status === 'ready';

  const raw = params.get('tab');
  // Assim que conecta, já pula direto pro Disparador — é o que o dono quer
  // ver primeiro, não uma tela de "conectado" parada.
  const active: TabId = isTabId(raw) ? raw : 'campanhas';
  const current = TABS.find((t) => t.id === active) ?? TABS[0];

  const selectTab = (id: TabId) => {
    if (!connected) return;
    // replace evita empilhar histórico a cada troca de aba.
    setParams(id === 'campanhas' ? {} : { tab: id }, { replace: true });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <Send className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Vivas Envia</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {connected
              ? 'Conecte seu WhatsApp e dispare mensagens em massa'
              : 'Escaneie o QR code pra desbloquear o painel de disparo em massa'}
          </p>
        </div>
      </div>

      {connected ? (
        <>
          <ConnectionStatusBar />

          <div className="flex flex-wrap gap-1 border-b border-[rgba(var(--accent-secondary-rgb),0.1)]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = t.id === active;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div>{current.render()}</div>
        </>
      ) : (
        <WebjsSettings />
      )}
    </div>
  );
}
