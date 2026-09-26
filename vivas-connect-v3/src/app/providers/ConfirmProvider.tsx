import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ----------------------------------------------------------------------------
// ConfirmProvider — substitui o `confirm()`/`window.confirm()` nativo do
// navegador (feedback do dono, 2026-08-27: "isso eu acho muito amador" — o
// popup do navegador mostra o domínio cru, "vivas-hub-lovat.vercel.app diz",
// e não segue o visual do sistema). `useConfirm()` devolve uma função
// assíncrona que abre um diálogo no estilo VIVAS (glassmorphism, mesmos
// tokens de cor) e resolve `true`/`false` conforme o clique — chamada e
// assinatura ficam quase idênticas ao `confirm()` de antes, só que
// `await`ada e bonita.
// ----------------------------------------------------------------------------

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Ações destrutivas (apagar) pintam o botão de confirmar em vermelho.
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((input) => {
    const normalized: ConfirmOptions = typeof input === 'string' ? { description: input } : input;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(normalized);
    });
  }, []);

  const close = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Dialog open onClose={() => close(false)} widthClass="max-w-sm" opaque>
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div
                className={
                  'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ' +
                  (options.danger ? 'bg-[rgba(239,68,68,0.15)]' : 'bg-[rgba(var(--accent-secondary-rgb),0.15)]')
                }
              >
                <AlertTriangle
                  className={'h-5 w-5 ' + (options.danger ? 'text-[var(--color-error)]' : 'text-[var(--accent-primary)]')}
                />
              </div>
              <div className="pt-1">
                {options.title && <h3 className="text-base font-bold text-display">{options.title}</h3>}
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">{options.description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                {options.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                type="button"
                variant={options.danger ? 'destructive' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {options.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}
