import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Instagram, MapPin, BadgeCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductDetailSheet } from './ProductDetailSheet';
import { useAgentSiteCart } from './AgentSiteCart';

// ----------------------------------------------------------------------------
// AgentSitePreviewCard — visual único do Vivas Perfil.
// ----------------------------------------------------------------------------
// Usado em DOIS lugares: a prévia ao vivo dentro do editor (AgentSiteSettings)
// e a página pública de verdade (PublicAgentSitePage). Existir num componente
// só garante que a prévia nunca fica diferente do resultado real.
//
// Redesenho 2026-09-24 (3ª rodada, pedido do dono: "o site está bem amador
// [...] queria algo mais profissional [...] um mini site detalhado"): capa
// alta de verdade (não mais 80px) com o avatar SOBREPOSTO na borda de baixo —
// com offset em PIXELS fixos (não margem percentual/negativa dependente de
// largura, que foi o que quebrou a v1 original), então não tem como
// "desalinhar" em nenhuma largura de tela. Produtos viraram cards grandes,
// clicáveis — abrem o ProductDetailSheet (specs, galeria, preço, botão de
// carrinho e de WhatsApp direto sobre aquele item).
//
// 2026-09-24 (4ª rodada, pedido do dono: "o modo computador é praticamente
// igual ao modo celular [...] dá pra fazer algo muito mais bonito"): o layout
// largo (`isWide`) NÃO usa breakpoint do Tailwind (`sm:`/`md:`) — esses
// reagem à largura REAL da janela, não à largura do container, e a prévia do
// editor simula "celular" encolhendo o container (mesmo com a janela do
// navegador inteira aberta). Em vez disso, um ResizeObserver mede a largura
// de verdade do próprio card e alterna o layout sozinho — funciona igual
// tanto na prévia simulada do editor quanto na página pública de verdade.
// Layout largo: nome + botão de WhatsApp lado a lado (botão não ocupa mais a
// largura toda) e produtos em grade de 2 colunas (cards verticais, foto em
// cima) em vez da lista empilhada.
//
// `accent_color_hex` é a cor de destaque ESCOLHIDA PELO CORRETOR pra própria
// página pública — não tem relação com o tema pessoal do painel. Aplicada via
// CSS var local `--site-accent`, nunca lendo `--accent-primary` do app.
// ----------------------------------------------------------------------------

const WIDE_BREAKPOINT_PX = 480;

export interface AgentSiteProductSpec {
  label: string;
  value: string;
}

export interface AgentSiteProduct {
  title: string;
  description?: string | null;
  photo_url?: string | null;
  // Fotos adicionais (além de photo_url), mostradas na galeria do painel de
  // detalhe — pedido do dono, 2026-09-24 ("especificações detalhadas e
  // organizadas").
  gallery?: string[] | null;
  url?: string | null;
  // Preço opcional, em centavos (mesmo padrão de plan_price_cents) — usado
  // no painel de detalhe e no total do carrinho. Sem preço, o produto ainda
  // funciona normalmente (carrinho só soma total se TODOS os itens tiverem).
  price_cents?: number | null;
  // Características em pares label/valor (ex: "Quartos" → "3") — pedido do
  // dono pra specs "detalhadas e organizadas" no painel do produto.
  specs?: AgentSiteProductSpec[] | null;
  // Endereço do imóvel/produto (opcional — só faz sentido pra quem vende
  // algo com localização física). `cep` guarda o dado bruto pra permitir
  // reeditar; `address` é a string já formatada (preenchida via ViaCEP,
  // editável depois) que aparece no card público.
  cep?: string | null;
  address?: string | null;
}

export interface AgentSiteCustomLink {
  label: string;
  url: string;
  color_hex: string;
}

export interface AgentSiteViewData {
  display_name: string;
  creci?: string | null;
  city?: string | null;
  instagram?: string | null;
  bio: string;
  photo_url?: string | null;
  cover_photo_url?: string | null;
  cover_focus_y?: number | null;
  whatsapp_number: string;
  accent_color_hex: string;
  products: AgentSiteProduct[];
  custom_links?: AgentSiteCustomLink[];
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

function instagramHandle(v: string): string {
  return v.trim().replace(/^@/, '');
}

interface AgentSitePreviewCardProps {
  site: AgentSiteViewData;
  // true só no editor, quando o dado mostrado é exemplo ilustrativo (campo
  // vazio) — mostra um selo "Exemplo" pra não confundir com dado real salvo.
  // Nunca true na página pública de verdade.
  placeholder?: boolean;
}

export function AgentSitePreviewCard({ site, placeholder = false }: AgentSitePreviewCardProps) {
  const hasCreciOrCity = Boolean(site.creci || site.city);
  const [openProduct, setOpenProduct] = useState<AgentSiteProduct | null>(null);
  const accent = site.accent_color_hex || '#3B82F6';

  const rootRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsWide(width >= WIDE_BREAKPOINT_PX);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const nameBlock = (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <h2 className="break-words text-lg font-bold leading-tight">{site.display_name || 'Seu nome'}</h2>
        {site.creci && <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--site-accent)' }} />}
      </div>
      {hasCreciOrCity && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-white/60">
          {site.creci && <span>CRECI {site.creci}</span>}
          {site.creci && site.city && <span>·</span>}
          {site.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {site.city}
            </span>
          )}
        </div>
      )}
      {site.instagram && (
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-white/60">
          <Instagram className="h-3 w-3" /> @{instagramHandle(site.instagram)}
        </span>
      )}
    </div>
  );

  const whatsappButton = site.whatsapp_number && (
    <a
      href={whatsappLink(site.whatsapp_number)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center justify-center gap-2.5 rounded-xl text-base font-bold text-white transition hover:scale-[1.02] hover:opacity-95 active:scale-[0.99]',
        isWide ? 'shrink-0 px-6 py-3.5' : 'w-full px-5 py-4',
      )}
      style={{
        background: 'var(--site-accent)',
        boxShadow: '0 8px 30px color-mix(in srgb, var(--site-accent) 55%, transparent)',
      }}
    >
      <MessageCircle className="h-5 w-5" />
      Falar no WhatsApp
    </a>
  );

  const instagramButton = site.instagram && (
    <a
      href={`https://instagram.com/${instagramHandle(site.instagram)}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center justify-center gap-2.5 rounded-xl text-base font-bold text-white transition hover:scale-[1.02] hover:opacity-95 active:scale-[0.99]',
        isWide ? 'shrink-0 px-6 py-3.5' : 'w-full px-5 py-4',
      )}
      style={{
        background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
        boxShadow: '0 8px 30px rgba(225, 48, 108, 0.45)',
      }}
    >
      <Instagram className="h-5 w-5" />
      Instagram
    </a>
  );

  const customLinkButtons = (site.custom_links ?? [])
    .filter((l) => l.label.trim() && l.url.trim())
    .map((link, i) => (
      <a
        key={i}
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'flex items-center justify-center gap-2.5 rounded-xl text-base font-bold text-white transition hover:scale-[1.02] hover:opacity-95 active:scale-[0.99]',
          isWide ? 'shrink-0 px-6 py-3.5' : 'w-full px-5 py-4',
        )}
        style={{
          background: link.color_hex || accent,
          boxShadow: `0 8px 30px color-mix(in srgb, ${link.color_hex || accent} 55%, transparent)`,
        }}
      >
        {link.label}
      </a>
    ));

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden rounded-2xl border"
      style={
        {
          '--site-accent': accent,
          background: '#0A0A0F',
          borderColor: 'color-mix(in srgb, var(--site-accent) 25%, transparent)',
          color: '#F8FAFC',
        } as React.CSSProperties
      }
    >
      {placeholder && (
        <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm">
          Exemplo
        </span>
      )}

      {/* Capa alta de verdade + avatar sobreposto na borda de baixo. Offset
          em pixels fixos — nunca depende da largura do container. */}
      <div className="relative">
        <div
          className={cn('w-full bg-cover', isWide ? 'h-52' : 'h-36 sm:h-44')}
          style={{
            background: site.cover_photo_url
              ? `url(${site.cover_photo_url}) center ${site.cover_focus_y ?? 50}%/cover no-repeat`
              : 'linear-gradient(135deg, color-mix(in srgb, var(--site-accent) 55%, #0A0A0F), #0A0A0F)',
          }}
        />
        <div className={cn('absolute left-4', isWide ? '-bottom-10' : '-bottom-8')}>
          {site.photo_url ? (
            <img
              src={site.photo_url}
              alt={site.display_name || 'Foto de perfil'}
              className={cn('rounded-2xl border-4 object-cover shadow-lg', isWide ? 'h-24 w-24' : 'h-20 w-20')}
              style={{ borderColor: '#0A0A0F' }}
            />
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-2xl border-4 bg-white/10 font-bold shadow-lg',
                isWide ? 'h-24 w-24 text-3xl' : 'h-20 w-20 text-2xl',
              )}
              style={{ borderColor: '#0A0A0F' }}
            >
              {(site.display_name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div className={cn('space-y-4 pb-5', isWide ? 'px-6 pt-14' : 'px-4 pt-11')}>
        {isWide ? (
          <div className="flex items-start justify-between gap-4">
            {nameBlock}
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {instagramButton}
              {whatsappButton}
            </div>
          </div>
        ) : (
          nameBlock
        )}

        {site.bio && <p className={cn('whitespace-pre-line text-sm text-white/75', isWide && 'max-w-2xl')}>{site.bio}</p>}

        {(!isWide || customLinkButtons.length > 0) && (
          <div className={cn('flex gap-2.5', isWide ? 'flex-wrap' : 'flex-col')}>
            {!isWide && whatsappButton}
            {!isWide && instagramButton}
            {customLinkButtons}
          </div>
        )}

        {site.products.length > 0 && (
          <div className="space-y-3 border-t border-white/10 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Produtos / Serviços</div>
            <div className={isWide ? 'grid grid-cols-2 gap-3 lg:grid-cols-3' : 'space-y-2.5'}>
              {site.products.map((p, i) => (
                <ProductCard key={i} product={p} accent={accent} wide={isWide} onOpen={() => setOpenProduct(p)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {openProduct && (
        <ProductDetailSheet
          product={openProduct}
          accentColor={accent}
          whatsappNumber={site.whatsapp_number}
          onClose={() => setOpenProduct(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  accent,
  wide,
  onOpen,
}: {
  product: AgentSiteProduct;
  accent: string;
  wide: boolean;
  onOpen: () => void;
}) {
  const { addItem } = useAgentSiteCart();

  const addToCartButton = (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        addItem(product);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          addItem(product);
        }
      }}
      className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-white"
    >
      + Carrinho
    </span>
  );

  if (wide) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/25"
      >
        {product.photo_url ? (
          <img src={product.photo_url} alt={product.title} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-white/5 text-[10px] text-white/30">sem foto</div>
        )}
        <div className="space-y-1 p-3">
          <div className="break-words text-sm font-semibold text-white">{product.title || 'Produto sem título'}</div>
          {product.price_cents ? (
            <div className="text-sm font-bold" style={{ color: accent }}>
              {formatBRL(product.price_cents)}
            </div>
          ) : null}
          {product.description && (
            <p className="line-clamp-2 whitespace-pre-line text-xs text-white/60">{product.description}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            {addToCartButton}
            <span className="inline-flex items-center gap-0.5 text-[10px] text-white/40">
              Detalhes <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left transition hover:border-white/25"
    >
      {product.photo_url ? (
        <img src={product.photo_url} alt={product.title} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[9px] text-white/30">
          sem foto
        </div>
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="break-words text-sm font-semibold text-white">{product.title || 'Produto sem título'}</div>
        {product.price_cents ? (
          <div className="mt-0.5 text-sm font-bold" style={{ color: accent }}>
            {formatBRL(product.price_cents)}
          </div>
        ) : null}
        {product.description && (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-white/60">{product.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          {addToCartButton}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-white/40">
            Ver detalhes <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}
