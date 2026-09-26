import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';
import { AgentSitePreviewCard, type AgentSiteProduct, type AgentSiteCustomLink } from '@/components/agent-site/AgentSitePreviewCard';
import { AgentSiteCartProvider, AgentSiteCartBar } from '@/components/agent-site/AgentSiteCart';

// ----------------------------------------------------------------------------
// PublicAgentSitePage — /c/:slug (VIVAS, Fase 1.2; redesenho 2026-08-24).
// ----------------------------------------------------------------------------
// Rota pública, sem sessão: consulta whatsapp_hub.agent_sites com a chave
// anon, que só enxerga linhas is_published=true de org ativa (policy
// agent_sites_public_read da migration 20260819150000). Fora de RequireSession
// de propósito — segue o mesmo padrão de /invite no router.
//
// Renderiza com o MESMO componente (AgentSitePreviewCard) usado na prévia do
// editor (AgentSiteSettings) — garante que o que o corretor vê editando é
// exatamente o que o lead vê aqui.
// ----------------------------------------------------------------------------

interface AgentSite {
  display_name: string;
  photo_url: string | null;
  cover_photo_url: string | null;
  cover_focus_y: number;
  bio: string;
  city: string | null;
  instagram: string | null;
  creci: string | null;
  accent_color_hex: string;
  whatsapp_number: string;
  products: AgentSiteProduct[];
  custom_links: AgentSiteCustomLink[];
}

export default function PublicAgentSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [site, setSite] = useState<AgentSite | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'not_found'>('loading');

  useEffect(() => {
    if (!slug) {
      setStatus('not_found');
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .schema('whatsapp_hub')
        .from('agent_sites')
        .select('display_name, photo_url, cover_photo_url, cover_focus_y, bio, city, instagram, creci, accent_color_hex, whatsapp_number, products, custom_links')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setStatus('not_found');
        return;
      }
      setSite({
        display_name: data.display_name as string,
        photo_url: (data.photo_url as string | null) ?? null,
        cover_photo_url: (data.cover_photo_url as string | null) ?? null,
        cover_focus_y: Number(data.cover_focus_y ?? 50),
        bio: (data.bio as string) ?? '',
        city: (data.city as string | null) ?? null,
        instagram: (data.instagram as string | null) ?? null,
        creci: (data.creci as string | null) ?? null,
        accent_color_hex: (data.accent_color_hex as string) || '#3B82F6',
        whatsapp_number: (data.whatsapp_number as string) ?? '',
        products: Array.isArray(data.products) ? (data.products as AgentSiteProduct[]) : [],
        custom_links: Array.isArray(data.custom_links) ? (data.custom_links as AgentSiteCustomLink[]) : [],
      });
      setStatus('ok');
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F]">
        <div className="text-xs uppercase tracking-widest text-white/40">Carregando...</div>
      </div>
    );
  }

  if (status === 'not_found' || !site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] p-6">
        <div className="max-w-md w-full rounded-2xl border border-white/10 p-8 text-center space-y-2 text-white">
          <h1 className="text-xl font-bold">Página não encontrada</h1>
          <p className="text-sm text-white/60">
            Esse perfil não existe ou não está publicado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AgentSiteCartProvider slug={slug ?? 'default'}>
      <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 pb-28">
        <div className="max-w-lg mx-auto lg:max-w-3xl">
          <AgentSitePreviewCard site={site} />
          <a
            href="/"
            className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Feito com
            <img src="/logo-mark.png" alt="" className="h-3.5 w-3.5 object-contain" />
            <span className="font-semibold">Vivas Connect</span>
          </a>
        </div>
      </div>
      <AgentSiteCartBar accentColor={site.accent_color_hex} whatsappNumber={site.whatsapp_number} displayName={site.display_name} />
    </AgentSiteCartProvider>
  );
}
