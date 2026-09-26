import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, X, Minus, Plus, Trash2 } from 'lucide-react';
import type { AgentSiteProduct } from './AgentSitePreviewCard';

// ----------------------------------------------------------------------------
// AgentSiteCart — carrinho do Vivas Perfil (pedido do dono, 2026-09-24):
// "criar tipo um carrinho que o cliente dele coloque e mande só para o
// whatsapp finalizar a compra". Não existe conceito de "pedido" no banco —
// o carrinho é só client-side (localStorage, por slug), e "finalizar" é
// literalmente abrir o WhatsApp do corretor com a lista pronta. Sem backend
// novo: é o mesmo modelo que catálogos de WhatsApp reais usam.
//
// Fica inerte (items sempre []) quando usado FORA de um AgentSiteCartProvider
// — é o caso da prévia dentro do editor (AgentSiteSettings), que só precisa
// mostrar a aparência, não precisa de carrinho funcional de verdade.
// ----------------------------------------------------------------------------

export interface AgentSiteCartItem {
  product: AgentSiteProduct;
  qty: number;
}

interface AgentSiteCartContextValue {
  items: AgentSiteCartItem[];
  addItem: (product: AgentSiteProduct) => void;
  removeItem: (title: string) => void;
  setQty: (title: string, qty: number) => void;
  clear: () => void;
}

const noop = () => {};
const AgentSiteCartContext = createContext<AgentSiteCartContextValue>({
  items: [],
  addItem: noop,
  removeItem: noop,
  setQty: noop,
  clear: noop,
});

export function useAgentSiteCart(): AgentSiteCartContextValue {
  return useContext(AgentSiteCartContext);
}

function storageKey(slug: string): string {
  return `vivas_perfil_carrinho_${slug}`;
}

function loadCart(slug: string): AgentSiteCartItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentSiteCartItem[]) : [];
  } catch {
    return [];
  }
}

export function AgentSiteCartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [items, setItems] = useState<AgentSiteCartItem[]>(() => loadCart(slug));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
    } catch {
      // localStorage indisponível (modo privado, etc.) — carrinho só não persiste no reload
    }
  }, [slug, items]);

  const addItem = useCallback((product: AgentSiteProduct) => {
    setItems((prev) => {
      const key = product.title.trim().toLowerCase();
      const existing = prev.find((it) => it.product.title.trim().toLowerCase() === key);
      if (existing) {
        return prev.map((it) => (it === existing ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { product, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((title: string) => {
    const key = title.trim().toLowerCase();
    setItems((prev) => prev.filter((it) => it.product.title.trim().toLowerCase() !== key));
  }, []);

  const setQty = useCallback((title: string, qty: number) => {
    const key = title.trim().toLowerCase();
    setItems((prev) =>
      qty <= 0
        ? prev.filter((it) => it.product.title.trim().toLowerCase() !== key)
        : prev.map((it) => (it.product.title.trim().toLowerCase() === key ? { ...it, qty } : it)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, addItem, removeItem, setQty, clear }), [items, addItem, removeItem, setQty, clear]);

  return <AgentSiteCartContext.Provider value={value}>{children}</AgentSiteCartContext.Provider>;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(number: string, message: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildCheckoutMessage(displayName: string, items: AgentSiteCartItem[]): string {
  const lines = items.map((it, i) => {
    const priceLabel = it.product.price_cents ? ` — ${formatBRL(it.product.price_cents * it.qty)}` : '';
    const qtyLabel = it.qty > 1 ? ` (x${it.qty})` : '';
    return `${i + 1}. ${it.product.title}${qtyLabel}${priceLabel}`;
  });
  const allHavePrice = items.every((it) => typeof it.product.price_cents === 'number' && it.product.price_cents > 0);
  const totalCents = items.reduce((sum, it) => sum + (it.product.price_cents ?? 0) * it.qty, 0);
  const totalLine = allHavePrice ? `\n\nTotal: ${formatBRL(totalCents)}` : '';
  return `Olá${displayName ? `, ${displayName}` : ''}! Tenho interesse nos itens abaixo:\n\n${lines.join('\n')}${totalLine}`;
}

// Barra flutuante fixa no rodapé — só aparece se tiver item no carrinho.
export function AgentSiteCartBar({
  accentColor,
  whatsappNumber,
  displayName,
}: {
  accentColor: string;
  whatsappNumber: string;
  displayName: string;
}) {
  const { items } = useAgentSiteCart();
  const [open, setOpen] = useState(false);
  const totalQty = items.reduce((sum, it) => sum + it.qty, 0);

  if (items.length === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-full px-5 py-3.5 text-sm font-bold text-white shadow-2xl transition hover:scale-[1.02] active:scale-[0.99]"
          style={{ background: accentColor, boxShadow: `0 10px 40px color-mix(in srgb, ${accentColor} 55%, transparent)` }}
        >
          <ShoppingBag className="h-4.5 w-4.5" />
          {totalQty} {totalQty === 1 ? 'item' : 'itens'} no carrinho
        </button>
      </div>
      {open && (
        <AgentSiteCartSheet
          accentColor={accentColor}
          whatsappNumber={whatsappNumber}
          displayName={displayName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AgentSiteCartSheet({
  accentColor,
  whatsappNumber,
  displayName,
  onClose,
}: {
  accentColor: string;
  whatsappNumber: string;
  displayName: string;
  onClose: () => void;
}) {
  const { items, removeItem, setQty, clear } = useAgentSiteCart();
  const allHavePrice = items.length > 0 && items.every((it) => typeof it.product.price_cents === 'number' && it.product.price_cents > 0);
  const totalCents = items.reduce((sum, it) => sum + (it.product.price_cents ?? 0) * it.qty, 0);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/10 bg-[#111116] p-5 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'calc(100vh - 3rem)', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Seu carrinho</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/50">Seu carrinho está vazio.</p>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.product.title} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                {it.product.photo_url ? (
                  <img src={it.product.photo_url} alt={it.product.title} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-white/5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{it.product.title}</div>
                  {it.product.price_cents ? (
                    <div className="text-xs text-white/60">{formatBRL(it.product.price_cents)}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQty(it.product.title, it.qty - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-4 text-center text-xs font-semibold text-white">{it.qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(it.product.title, it.qty + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(it.product.title)}
                    className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:text-red-400"
                    aria-label="Remover do carrinho"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {allHavePrice && (
              <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                <span className="text-white/60">Total</span>
                <span className="font-bold text-white">{formatBRL(totalCents)}</span>
              </div>
            )}

            <a
              href={whatsappLink(whatsappNumber, buildCheckoutMessage(displayName, items))}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-95"
              style={{ background: accentColor }}
            >
              Finalizar no WhatsApp
            </a>
            <button type="button" onClick={clear} className="mx-auto block pt-1 text-xs text-white/40 hover:text-white/70">
              Esvaziar carrinho
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
