import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, MessageCircle, ShoppingBag, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentSiteProduct } from './AgentSitePreviewCard';
import { useAgentSiteCart } from './AgentSiteCart';

// ----------------------------------------------------------------------------
// ProductDetailSheet — pedido do dono, 2026-09-24: ao clicar num produto,
// mostrar "especificações detalhadas e organizadas" + opção de falar no
// WhatsApp sobre AQUELE item + adicionar ao carrinho. Gaveta/modal (não uma
// rota nova) — mais rápido de navegar pro visitante e reaproveita o mesmo
// componente tanto na prévia do editor quanto na página pública de verdade.
// ----------------------------------------------------------------------------

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(number: string, message: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function ProductDetailSheet({
  product,
  accentColor,
  whatsappNumber,
  onClose,
}: {
  product: AgentSiteProduct;
  accentColor: string;
  whatsappNumber: string;
  onClose: () => void;
}) {
  const { addItem } = useAgentSiteCart();
  const [added, setAdded] = useState(false);
  const photos = [product.photo_url, ...(product.gallery ?? [])].filter((u): u is string => Boolean(u));
  const [activePhoto, setActivePhoto] = useState(0);

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

  const message = `Olá! Tenho interesse em: ${product.title}${product.price_cents ? ` (${formatBRL(product.price_cents)})` : ''}`;

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    toast.success('Adicionado ao carrinho.');
    window.setTimeout(() => setAdded(false), 1800);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-white/10 bg-[#111116] shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {photos.length > 0 ? (
          <div>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-t-2xl bg-white/5 sm:rounded-t-2xl">
              <img src={photos[activePhoto]} alt={product.title} className="h-full w-full object-cover" />
            </div>
            {photos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2.5">
                {photos.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition"
                    style={{ borderColor: i === activePhoto ? accentColor : 'transparent' }}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-8" />
        )}

        <div className="space-y-4 p-5 pt-2">
          <div>
            <h2 className="text-lg font-bold leading-tight text-white">{product.title || 'Produto sem título'}</h2>
            {product.price_cents ? (
              <p className="mt-1 text-xl font-bold" style={{ color: accentColor }}>
                {formatBRL(product.price_cents)}
              </p>
            ) : null}
          </div>

          {product.specs && product.specs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {product.specs.map((spec, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-white/40">{spec.label}</div>
                  <div className="text-sm font-semibold text-white">{spec.value}</div>
                </div>
              ))}
            </div>
          )}

          {product.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">{product.description}</p>
          )}

          {product.address && (
            <p className="flex items-start gap-1.5 text-sm text-white/60">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {product.address}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <button
              type="button"
              onClick={handleAdd}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
            >
              {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
              {added ? 'Adicionado' : 'Adicionar ao carrinho'}
            </button>
            {whatsappNumber && (
              <a
                href={whatsappLink(whatsappNumber, message)}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:opacity-95"
                style={{ background: accentColor }}
              >
                <MessageCircle className="h-4 w-4" />
                Falar sobre isso
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
