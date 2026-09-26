import { useEffect } from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

// Canto inferior direito + menor (pedido do dono: o toast padrão, grande e
// no topo, ficava chamando atenção demais/atrapalhando — ex.: "Tema aplicado"
// cobrindo boa parte da tela ao trocar de tema em Configurações). Clicar no
// corpo do toast dispensa ele na hora (pedido do dono: "e nao execer nenhuma
// função" — só fecha, não deve disparar nenhuma ação por baixo). Botões/links
// dentro do toast (ex.: "Tentar de novo") ficam de fora dessa regra e
// continuam funcionando normalmente.
//
// NÃO usa `.glass-card` aqui de propósito — o `backdrop-filter: blur(40px)`
// dela combinado com a animação de entrada/saída (transform + opacity) do
// sonner gera um "borrão de cor" visível (artefato conhecido de navegador:
// backdrop-blur + transform animado deixa um rastro fantasma colorido do que
// está atrás, reportado pelo dono). Fundo sólido evita a classe toda desse
// bug — sem blur, não tem o que "borrar". Duração padrão de 1s (pedido do
// dono) — some sozinha rápido; uma chamada específica ainda pode passar seu
// próprio `duration` se algum dia precisar de mais tempo pra ler.
export function Toaster() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const toastEl = target.closest('[data-sonner-toast]');
      if (!toastEl) return;
      if (target.closest('button, a, [data-close-button], [data-button], [data-cancel]')) return;
      e.preventDefault();
      e.stopPropagation();
      sonnerToast.dismiss();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      richColors
      style={{ '--width': '280px' } as React.CSSProperties}
      toastOptions={{
        duration: 1000,
        classNames: {
          toast:
            'rounded-2xl border !border-[rgba(var(--accent-secondary-rgb),0.25)] !bg-[var(--color-bg-primary)] !text-[var(--color-text-primary)] !p-3 !gap-2 !cursor-pointer !backdrop-blur-none shadow-[0_8px_30px_rgba(0,0,0,0.45)]',
          title: '!text-xs',
          description: '!text-[11px] !text-[var(--color-text-secondary)]',
          icon: '!h-3.5 !w-3.5',
        },
      }}
    />
  );
}
