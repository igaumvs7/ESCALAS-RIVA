import { useState } from 'react';
import { toast } from 'sonner';
import { Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPulse } from '@/components/ui/StatusPulse';
import { getSupabase } from '@/lib/supabase';
import { useConfirm } from '@/app/providers/ConfirmProvider';
import { useWebjsSession } from '@/hooks/useWebjsSession';

// ----------------------------------------------------------------------------
// ConnectionStatusBar — pedido do dono (2026-08-27): a aba "Conexão" isolada
// não servia pra nada depois de conectado ("só diz que estou conectado...
// a primeira aba tem que ser o disparador, não tem outra"). Substitui a aba
// inteira por essa faixa fina sempre visível no topo, com só o essencial
// (status + desconectar) — o disparador vira a única tela de verdade.
// ----------------------------------------------------------------------------
export function ConnectionStatusBar() {
  const { session, setSession } = useWebjsSession();
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const handleDeactivate = async () => {
    const ok = await confirm({
      title: 'Desconectar WhatsApp',
      description: 'Desconectar o WhatsApp? Você vai precisar escanear o QR code de novo.',
      confirmLabel: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('webjs-deactivate', { body: {} });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error('Não foi possível desconectar');
      return;
    }
    toast.success('Desconectado.');
    setSession(null);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.05)] px-4 py-2.5">
      <div className="flex items-center gap-2.5 text-sm">
        <StatusPulse tone="success" />
        <span>
          WhatsApp conectado{session?.phone ? ` — ${session.phone}` : ''}
        </span>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={handleDeactivate} disabled={busy}>
        <Power className="h-3.5 w-3.5" />
        Desconectar
      </Button>
    </div>
  );
}
