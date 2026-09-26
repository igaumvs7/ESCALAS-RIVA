import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ExternalLink, Copy, ImagePlus, Upload, Smartphone, Monitor, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';
import { compressImageForUpload } from '@/lib/image-compress';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { AgentSitePreviewCard, type AgentSiteProduct, type AgentSiteProductSpec, type AgentSiteCustomLink, type AgentSiteViewData } from '@/components/agent-site/AgentSitePreviewCard';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { PROFESSIONS, REAL_ESTATE_PROFESSION } from '@/lib/professions';

// ----------------------------------------------------------------------------
// AgentSiteSettings — editor do Vivas Perfil (perfil público do profissional).
// ----------------------------------------------------------------------------
// Redesenho 2026-08-24 (pedido do dono, referência visual: editor com capa +
// avatar + grid de campos + prévia ao vivo mobile/desktop + catálogo de
// produtos com foto). 1 linha por org em whatsapp_hub.agent_sites.
//
// O WhatsApp exibido AQUI é sempre o número conectado no Vivas Envia
// (whatsapp_hub.channels, provider='webjs') — não um campo livre. Isso
// garante que o botão "Falar no WhatsApp" da página pública sempre cai na
// mesma sessão Baileys que a IA está monitorando; deixar o corretor digitar
// um número à mão permitiria divergência (lead manda mensagem pra um número
// que ninguém está ouvindo).
// ----------------------------------------------------------------------------

const BUCKET = 'whatsapp-hub-site-media';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

interface AgentSiteRow {
  slug: string;
  display_name: string;
  photo_url: string | null;
  cover_photo_url: string | null;
  cover_focus_y: number;
  bio: string;
  city: string | null;
  instagram: string | null;
  email: string | null;
  segmento: string | null;
  creci: string | null;
  accent_color_hex: string;
  whatsapp_number: string;
  products: AgentSiteProduct[];
  custom_links: AgentSiteCustomLink[];
  is_published: boolean;
}

const EMPTY: AgentSiteRow = {
  slug: '',
  display_name: '',
  photo_url: '',
  cover_photo_url: '',
  cover_focus_y: 50,
  bio: '',
  city: '',
  instagram: '',
  email: '',
  segmento: '',
  creci: '',
  accent_color_hex: '#3B82F6',
  whatsapp_number: '',
  products: [],
  custom_links: [],
  is_published: false,
};

const DIACRITICS_RE = /[̀-ͯ]/g;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Exemplo ilustrativo pra prévia nunca ficar vazia — só usado aqui no editor
// Adaptação por profissão — textos de exemplo mudam conforme o segmento.
interface ProfessionHints {
  sampleBio: string;
  sampleProducts: AgentSiteProduct[];
  sectionTitle: string;
  titlePlaceholder: string;
  descPlaceholder: string;
  specLabelPlaceholder: string;
  specValuePlaceholder: string;
  showAddress: boolean;
}

const DEFAULT_HINTS: ProfessionHints = {
  sampleBio: 'Profissional com experiência, atendimento personalizado. Entre em contato para saber mais.',
  sampleProducts: [
    { title: 'Pacote Completo', description: 'Serviço premium com acompanhamento dedicado do início ao fim.', photo_url: null, url: null, price_cents: 49900, specs: [{ label: 'Duração', value: '30 dias' }] },
    { title: 'Consultoria Express', description: 'Sessão rápida de orientação profissional personalizada.', photo_url: null, url: null, price_cents: 15000, specs: [{ label: 'Duração', value: '1h' }] },
    { title: 'Avaliação Gratuita', description: 'Primeiro contato sem compromisso — conheça o meu trabalho.', photo_url: null, url: null },
  ],
  sectionTitle: 'Produtos / Serviços',
  titlePlaceholder: 'Título (ex: Consultoria, Pacote VIP)',
  descPlaceholder: 'Descrição curta do produto ou serviço',
  specLabelPlaceholder: 'Ex: Duração',
  specValuePlaceholder: 'Ex: 1 mês',
  showAddress: false,
};

function getHints(segmento: string | null): ProfessionHints {
  const s = segmento?.toLowerCase() ?? '';

  if (s.includes('imóveis'))
    return {
      sampleBio: 'Corretor(a) há 8 anos, especialista em imóveis residenciais. Atendimento do primeiro contato à chave na mão.',
      sampleProducts: [
        { title: 'Apto 2 quartos — Centro', description: '65m², 1 vaga, a 200m da praça.', photo_url: null, url: null, price_cents: 32000000, specs: [{ label: 'Quartos', value: '2' }, { label: 'Área', value: '65m²' }] },
        { title: 'Casa 3 quartos — Bairro Novo', description: 'Quintal amplo, área gourmet.', photo_url: null, url: null },
      ],
      sectionTitle: 'Imóveis',
      titlePlaceholder: 'Título (ex: Apto 2 quartos - Centro)',
      descPlaceholder: 'Informações (ex: 65m², 2 quartos, vaga)',
      specLabelPlaceholder: 'Ex: Quartos',
      specValuePlaceholder: 'Ex: 3',
      showAddress: true,
    };

  if (s.includes('seguros'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Corretor(a) de seguros com atendimento dedicado. Proteja o que é seu com as melhores condições.',
      sampleProducts: [
        { title: 'Seguro Auto Completo', description: 'Cobertura total com assistência 24h.', photo_url: null, url: null, price_cents: 18000, specs: [{ label: 'Cobertura', value: 'Completa' }] },
        { title: 'Seguro Residencial', description: 'Proteção para sua casa e família.', photo_url: null, url: null },
      ],
      sectionTitle: 'Planos / Seguros',
      titlePlaceholder: 'Título (ex: Seguro Auto Completo)',
      descPlaceholder: 'Detalhes da cobertura ou plano',
    };

  if (s.includes('cabeleirei') || s.includes('barbei') || s.includes('esteticista') || s.includes('manicure') || s.includes('maquiad') || s.includes('depilad') || s.includes('sobrancelha') || s.includes('micropigment'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Especialista em beleza, transformando autoestima há anos. Agende seu horário!',
      sampleProducts: [
        { title: 'Corte + Escova', description: 'Corte personalizado com finalização.', photo_url: null, url: null, price_cents: 8000, specs: [{ label: 'Duração', value: '1h' }] },
        { title: 'Coloração Completa', description: 'Tintura com produtos premium.', photo_url: null, url: null, price_cents: 15000 },
      ],
      sectionTitle: 'Serviços',
      titlePlaceholder: 'Título (ex: Corte + Escova)',
      descPlaceholder: 'Detalhes do serviço',
      specLabelPlaceholder: 'Ex: Duração',
      specValuePlaceholder: 'Ex: 1h',
    };

  if (s.includes('personal') || s.includes('nutricion'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Transformando vidas através da saúde e bem-estar. Treinos e planos personalizados.',
      sampleProducts: [
        { title: 'Plano Mensal', description: 'Treinos personalizados + acompanhamento.', photo_url: null, url: null, price_cents: 25000, specs: [{ label: 'Duração', value: '30 dias' }, { label: 'Sessões', value: '12' }] },
        { title: 'Avaliação Física', description: 'Análise completa + plano inicial.', photo_url: null, url: null, price_cents: 15000 },
      ],
      sectionTitle: 'Planos / Serviços',
      titlePlaceholder: 'Título (ex: Plano Mensal, Avaliação)',
      descPlaceholder: 'Detalhes do plano ou serviço',
      specLabelPlaceholder: 'Ex: Sessões',
      specValuePlaceholder: 'Ex: 12',
    };

  if (s.includes('dentista') || s.includes('médic') || s.includes('psicólog') || s.includes('fisioterapeut') || s.includes('fonoaudiólog') || s.includes('massoterapeut') || s.includes('terapeut') || s.includes('enfermeir'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Profissional da saúde com atendimento humanizado e acolhedor. Agende sua consulta.',
      sampleProducts: [
        { title: 'Consulta Inicial', description: 'Avaliação completa e orientação.', photo_url: null, url: null, price_cents: 25000, specs: [{ label: 'Duração', value: '50 min' }] },
        { title: 'Retorno', description: 'Acompanhamento do tratamento.', photo_url: null, url: null, price_cents: 15000 },
      ],
      sectionTitle: 'Consultas / Serviços',
      titlePlaceholder: 'Título (ex: Consulta, Procedimento)',
      descPlaceholder: 'Detalhes da consulta ou procedimento',
      specLabelPlaceholder: 'Ex: Duração',
      specValuePlaceholder: 'Ex: 50 min',
    };

  if (s.includes('veterinári'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Cuidando do seu pet com carinho e dedicação. Consultas, vacinas e emergências.',
      sampleProducts: [
        { title: 'Consulta Veterinária', description: 'Exame clínico completo.', photo_url: null, url: null, price_cents: 18000 },
        { title: 'Vacinação', description: 'Vacinas essenciais para cães e gatos.', photo_url: null, url: null, price_cents: 8000 },
      ],
      sectionTitle: 'Serviços',
      titlePlaceholder: 'Título (ex: Consulta, Vacinação)',
      descPlaceholder: 'Detalhes do serviço',
    };

  if (s.includes('advogad'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Advocacia especializada com foco em resultados. Consulta inicial gratuita.',
      sampleProducts: [
        { title: 'Consulta Jurídica', description: 'Análise do caso e orientação.', photo_url: null, url: null, price_cents: 30000, specs: [{ label: 'Duração', value: '1h' }] },
        { title: 'Contrato sob medida', description: 'Elaboração ou revisão de contrato.', photo_url: null, url: null, price_cents: 80000 },
      ],
      sectionTitle: 'Serviços Jurídicos',
      titlePlaceholder: 'Título (ex: Consulta, Contrato)',
      descPlaceholder: 'Detalhes do serviço jurídico',
    };

  if (s.includes('contador'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Contabilidade descomplicada para sua empresa crescer com segurança.',
      sampleProducts: [
        { title: 'Plano MEI', description: 'Abertura + declarações mensais.', photo_url: null, url: null, price_cents: 9900, specs: [{ label: 'Tipo', value: 'Mensal' }] },
        { title: 'Plano Empresa', description: 'Contabilidade completa + folha.', photo_url: null, url: null, price_cents: 39900 },
      ],
      sectionTitle: 'Planos',
      titlePlaceholder: 'Título (ex: Plano MEI, Declaração IR)',
      descPlaceholder: 'Detalhes do serviço contábil',
    };

  if (s.includes('fotógraf') || s.includes('videomaker'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Registrando momentos únicos com criatividade e qualidade profissional.',
      sampleProducts: [
        { title: 'Ensaio Fotográfico', description: '2h de ensaio + 30 fotos editadas.', photo_url: null, url: null, price_cents: 45000, specs: [{ label: 'Fotos', value: '30' }, { label: 'Duração', value: '2h' }] },
        { title: 'Cobertura de Evento', description: 'Foto + vídeo do seu evento.', photo_url: null, url: null, price_cents: 150000 },
      ],
      sectionTitle: 'Serviços',
      titlePlaceholder: 'Título (ex: Ensaio, Cobertura)',
      descPlaceholder: 'Detalhes do pacote',
      specLabelPlaceholder: 'Ex: Fotos',
      specValuePlaceholder: 'Ex: 30',
    };

  if (s.includes('arquitet') || s.includes('designer de interiores'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Transformando espaços com design funcional e personalizado.',
      sampleProducts: [
        { title: 'Projeto de Interiores', description: 'Projeto completo com 3D.', photo_url: null, url: null, price_cents: 350000 },
        { title: 'Consultoria de Decoração', description: 'Orientação rápida pro seu espaço.', photo_url: null, url: null, price_cents: 50000 },
      ],
      sectionTitle: 'Projetos / Serviços',
      titlePlaceholder: 'Título (ex: Projeto Residencial)',
      descPlaceholder: 'Detalhes do projeto ou serviço',
    };

  if (s.includes('confeitei') || s.includes('docei') || s.includes('chef'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Sabor artesanal feito com carinho. Encomendas e eventos sob medida.',
      sampleProducts: [
        { title: 'Bolo Decorado', description: 'Bolo personalizado para sua festa.', photo_url: null, url: null, price_cents: 12000, specs: [{ label: 'Tamanho', value: 'Médio' }] },
        { title: 'Kit Doces - 100un', description: 'Brigadeiros, beijinhos e mais.', photo_url: null, url: null, price_cents: 18000 },
      ],
      sectionTitle: 'Produtos / Cardápio',
      titlePlaceholder: 'Título (ex: Bolo Decorado, Kit Doces)',
      descPlaceholder: 'Detalhes do produto ou sabor',
      specLabelPlaceholder: 'Ex: Tamanho',
      specValuePlaceholder: 'Ex: Médio',
    };

  if (s.includes('vendedor') && s.includes('automotiv'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Vendedor automotivo com os melhores negócios. Financiamento facilitado.',
      sampleProducts: [
        { title: 'HB20 2023', description: 'Completo, único dono, revisado.', photo_url: null, url: null, price_cents: 7500000, specs: [{ label: 'Km', value: '35.000' }, { label: 'Câmbio', value: 'Automático' }] },
        { title: 'Onix Plus 2024', description: 'Seminovo com garantia de fábrica.', photo_url: null, url: null, price_cents: 9200000 },
      ],
      sectionTitle: 'Veículos',
      titlePlaceholder: 'Título (ex: HB20 2023 Completo)',
      descPlaceholder: 'Detalhes do veículo',
      specLabelPlaceholder: 'Ex: Km',
      specValuePlaceholder: 'Ex: 35.000',
      showAddress: true,
    };

  if (s.includes('pet shop') || s.includes('banho') || s.includes('adestrad'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Cuidando do seu pet com carinho. Banho, tosa e muito amor!',
      sampleProducts: [
        { title: 'Banho + Tosa Higiênica', description: 'Banho completo com secagem.', photo_url: null, url: null, price_cents: 6000, specs: [{ label: 'Porte', value: 'Médio' }] },
        { title: 'Pacote Mensal (4 banhos)', description: 'Economia de 20% no mês.', photo_url: null, url: null, price_cents: 20000 },
      ],
      sectionTitle: 'Serviços',
      titlePlaceholder: 'Título (ex: Banho + Tosa)',
      descPlaceholder: 'Detalhes do serviço',
      specLabelPlaceholder: 'Ex: Porte',
      specValuePlaceholder: 'Ex: Médio',
    };

  if (s.includes('professor') || s.includes('tutor'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Aulas particulares com método personalizado. Resultados comprovados.',
      sampleProducts: [
        { title: 'Aula Avulsa', description: 'Aula individual online ou presencial.', photo_url: null, url: null, price_cents: 8000, specs: [{ label: 'Duração', value: '1h' }] },
        { title: 'Pacote 8 aulas', description: 'Acompanhamento semanal com desconto.', photo_url: null, url: null, price_cents: 55000 },
      ],
      sectionTitle: 'Aulas / Pacotes',
      titlePlaceholder: 'Título (ex: Aula Avulsa, Pacote)',
      descPlaceholder: 'Detalhes da aula ou pacote',
      specLabelPlaceholder: 'Ex: Duração',
      specValuePlaceholder: 'Ex: 1h',
    };

  if (s.includes('social media') || s.includes('marketing'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Gestão de redes sociais e marketing digital que gera resultados reais.',
      sampleProducts: [
        { title: 'Gestão Mensal', description: 'Planejamento + criação + postagens.', photo_url: null, url: null, price_cents: 150000, specs: [{ label: 'Posts', value: '20/mês' }] },
        { title: 'Pacote de Criativos', description: '10 artes prontas para suas redes.', photo_url: null, url: null, price_cents: 50000 },
      ],
      sectionTitle: 'Planos / Serviços',
      titlePlaceholder: 'Título (ex: Gestão Mensal)',
      descPlaceholder: 'Detalhes do serviço',
      specLabelPlaceholder: 'Ex: Posts',
      specValuePlaceholder: 'Ex: 20/mês',
    };

  if (s.includes('eletricista') || s.includes('encanad') || s.includes('pedreir') || s.includes('marceneir') || s.includes('jardinei') || s.includes('paisagist') || s.includes('chavei') || s.includes('dedetiz'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Serviço profissional com qualidade e garantia. Orçamento sem compromisso.',
      sampleProducts: [
        { title: 'Visita Técnica', description: 'Avaliação no local + orçamento.', photo_url: null, url: null, price_cents: 10000 },
        { title: 'Manutenção Preventiva', description: 'Revisão completa para evitar problemas.', photo_url: null, url: null, price_cents: 25000 },
      ],
      sectionTitle: 'Serviços',
      titlePlaceholder: 'Título (ex: Visita Técnica, Instalação)',
      descPlaceholder: 'Detalhes do serviço',
      showAddress: true,
    };

  if (s.includes('desenvolvedor') || s.includes('programad'))
    return {
      ...DEFAULT_HINTS,
      sampleBio: 'Desenvolvimento de sites, apps e sistemas sob medida. Do projeto à entrega.',
      sampleProducts: [
        { title: 'Landing Page', description: 'Página profissional de conversão.', photo_url: null, url: null, price_cents: 150000, specs: [{ label: 'Prazo', value: '7 dias' }] },
        { title: 'Sistema Web', description: 'Aplicação completa sob medida.', photo_url: null, url: null, price_cents: 500000 },
      ],
      sectionTitle: 'Serviços / Projetos',
      titlePlaceholder: 'Título (ex: Landing Page, App)',
      descPlaceholder: 'Detalhes do projeto ou serviço',
      specLabelPlaceholder: 'Ex: Prazo',
      specValuePlaceholder: 'Ex: 7 dias',
    };

  return DEFAULT_HINTS;
}

function centsToInput(cents: number | null | undefined): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function inputToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.]/g, '').replace(',', '.');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

interface ViaCepResult {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

// ViaCEP — API pública brasileira, sem chave, devolve endereço a partir do
// CEP. Chamada direto do navegador (CORS liberado, é o uso padrão dela).
async function lookupCep(cep: string): Promise<string | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) throw new Error('Falha ao consultar o CEP.');
  const data = (await res.json()) as ViaCepResult;
  if (data.erro) return null;
  return [data.logradouro, data.bairro, [data.localidade, data.uf].filter(Boolean).join('/')]
    .filter((part) => part && part.trim())
    .join(', ');
}

function buildPreviewSite(
  form: AgentSiteRow,
  connectedPhone: string | null,
  hints: ProfessionHints,
): { site: AgentSiteViewData; isPlaceholder: boolean } {
  const isPlaceholder = !form.display_name.trim() || !form.bio.trim() || form.products.length === 0;
  return {
    isPlaceholder,
    site: {
      display_name: form.display_name.trim() || 'Seu Nome Aqui',
      creci: form.creci,
      city: form.city?.trim() || 'Sua cidade',
      instagram: form.instagram,
      bio: form.bio.trim() || hints.sampleBio,
      photo_url: form.photo_url,
      cover_photo_url: form.cover_photo_url,
      cover_focus_y: form.cover_focus_y,
      whatsapp_number: connectedPhone ?? '5511999999999',
      accent_color_hex: form.accent_color_hex,
      products: form.products.length > 0 ? form.products : hints.sampleProducts,
      custom_links: form.custom_links,
    },
  };
}

async function uploadSiteMedia(orgId: string, file: File): Promise<string> {
  const supabase = getSupabase();
  // Otimiza no navegador ANTES de subir — foto de celular sem compressão
  // pode passar de 3-4MB, o que pesa demais quando o site é visitado (ver
  // src/lib/image-compress.ts pro raciocínio completo). Nunca distorce
  // (mesma escala nos dois eixos) e mantém qualidade visual — só reduz o
  // que passa de 1600px, que já é mais que suficiente pra qualquer exibição
  // no site.
  const optimized = await compressImageForUpload(file);
  const ext = optimized.type === 'image/webp'
    ? 'webp'
    : (optimized.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, {
      contentType: optimized.type || 'image/jpeg',
      upsert: false,
      // Nome do arquivo é sempre um UUID novo (nunca reaproveitado — upsert
      // false acima) e o dado nunca muda depois de subido, então é seguro
      // cachear por 1 ano: visitante que volta ao mesmo perfil não baixa a
      // mesma foto de novo, reduz a transferência do Storage sem nenhum
      // risco de mostrar foto desatualizada.
      cacheControl: '31536000',
    });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function AgentSiteSettings() {
  const { orgId, refreshProfession } = useAppUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [form, setForm] = useState<AgentSiteRow>(EMPTY);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState<number | null>(null);
  const [cepLoading, setCepLoading] = useState<number | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const productInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const supabase = getSupabase();
      const [siteRes, channelRes] = await Promise.all([
        supabase
          .schema('whatsapp_hub')
          .from('agent_sites')
          .select('slug, display_name, photo_url, cover_photo_url, cover_focus_y, bio, city, instagram, email, segmento, creci, accent_color_hex, whatsapp_number, products, custom_links, is_published')
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase
          .schema('whatsapp_hub')
          .from('channels')
          .select('phone')
          .eq('org_id', orgId)
          .eq('provider', 'webjs')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (siteRes.error) {
        toast.error('Falha ao carregar o perfil', { description: siteRes.error.message });
      } else if (siteRes.data) {
        const data = siteRes.data;
        setExists(true);
        setForm({
          slug: data.slug as string,
          display_name: (data.display_name as string) ?? '',
          photo_url: (data.photo_url as string | null) ?? '',
          cover_photo_url: (data.cover_photo_url as string | null) ?? '',
          cover_focus_y: Number(data.cover_focus_y ?? 50),
          bio: (data.bio as string) ?? '',
          city: (data.city as string | null) ?? '',
          instagram: (data.instagram as string | null) ?? '',
          email: (data.email as string | null) ?? '',
          segmento: (data.segmento as string | null) ?? '',
          creci: (data.creci as string | null) ?? '',
          accent_color_hex: (data.accent_color_hex as string) || '#3B82F6',
          whatsapp_number: (data.whatsapp_number as string) ?? '',
          products: Array.isArray(data.products) ? (data.products as AgentSiteProduct[]) : [],
          custom_links: Array.isArray(data.custom_links) ? (data.custom_links as AgentSiteCustomLink[]) : [],
          is_published: Boolean(data.is_published),
        });
      }
      setConnectedPhone((channelRes.data?.phone as string | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const updateProduct = (index: number, patch: Partial<AgentSiteProduct>) => {
    setForm((f) => ({
      ...f,
      products: f.products.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  };

  const addProduct = () => {
    setForm((f) => ({
      ...f,
      products: [
        ...f.products,
        { title: '', description: '', photo_url: '', url: '', cep: '', address: '', price_cents: null, specs: [], gallery: [] },
      ],
    }));
  };

  const addSpec = (index: number) => {
    updateProduct(index, { specs: [...(form.products[index].specs ?? []), { label: '', value: '' }] });
  };

  const updateSpec = (index: number, specIndex: number, patch: Partial<AgentSiteProductSpec>) => {
    const specs = (form.products[index].specs ?? []).map((s, i) => (i === specIndex ? { ...s, ...patch } : s));
    updateProduct(index, { specs });
  };

  const removeSpec = (index: number, specIndex: number) => {
    updateProduct(index, { specs: (form.products[index].specs ?? []).filter((_, i) => i !== specIndex) });
  };

  const removeGalleryPhoto = (index: number, photoIndex: number) => {
    updateProduct(index, { gallery: (form.products[index].gallery ?? []).filter((_, i) => i !== photoIndex) });
  };

  // Digita o CEP → formata (00000-000) → ao completar 8 dígitos, busca o
  // endereço na ViaCEP e preenche sozinho (mas o campo continua editável,
  // pra dar pra completar com número/complemento).
  const handleCepChange = async (index: number, raw: string) => {
    const formatted = formatCep(raw);
    updateProduct(index, { cep: formatted });
    if (formatted.replace(/\D/g, '').length !== 8) return;
    setCepLoading(index);
    try {
      const address = await lookupCep(formatted);
      if (address) {
        updateProduct(index, { address });
      } else {
        toast.error('CEP não encontrado', { description: 'Confira o número ou preencha o endereço manualmente.' });
      }
    } catch (err) {
      toast.error('Falha ao buscar o CEP', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setCepLoading(null);
    }
  };

  const removeProduct = (index: number) => {
    setForm((f) => ({ ...f, products: f.products.filter((_, i) => i !== index) }));
  };

  const pickFile = (e: ChangeEvent<HTMLInputElement>, onFile: (f: File) => void) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_PHOTO_BYTES) {
      toast.error('Imagem muito grande (máx 8MB).');
      return;
    }
    onFile(f);
  };

  const handleCoverFile = async (file: File) => {
    if (!orgId) return;
    setUploadingCover(true);
    try {
      const url = await uploadSiteMedia(orgId, file);
      setForm((f) => ({ ...f, cover_photo_url: url }));
    } catch (err) {
      toast.error('Falha no upload da capa', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (!orgId) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadSiteMedia(orgId, file);
      setForm((f) => ({ ...f, photo_url: url }));
    } catch (err) {
      toast.error('Falha no upload da foto', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProductFile = async (index: number, file: File) => {
    if (!orgId) return;
    setUploadingProduct(index);
    try {
      const url = await uploadSiteMedia(orgId, file);
      updateProduct(index, { photo_url: url });
    } catch (err) {
      toast.error('Falha no upload da foto do produto', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingProduct(null);
    }
  };

  // Galeria — fotos ADICIONAIS (além da capa do produto), mostradas no painel
  // de detalhe (pedido do dono: "especificações detalhadas e organizadas").
  const handleProductGalleryFile = async (index: number, file: File) => {
    if (!orgId) return;
    setUploadingProduct(index);
    try {
      const url = await uploadSiteMedia(orgId, file);
      updateProduct(index, { gallery: [...(form.products[index].gallery ?? []), url] });
    } catch (err) {
      toast.error('Falha no upload da foto', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingProduct(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    const slug = slugify(form.slug);
    if (slug.length < 3) {
      toast.error('O link do site precisa ter pelo menos 3 caracteres.');
      return;
    }
    if (!form.display_name.trim()) {
      toast.error('Informe seu nome de exibição.');
      return;
    }
    if (form.is_published && !connectedPhone) {
      toast.error('Conecte seu WhatsApp no Vivas Envia antes de publicar.', {
        description: 'Sem número conectado, o botão "Falar no WhatsApp" não teria pra onde mandar mensagem.',
      });
      return;
    }

    setSaving(true);
    const supabase = getSupabase();
    const payload = {
      org_id: orgId,
      slug,
      display_name: form.display_name.trim(),
      photo_url: form.photo_url?.trim() || null,
      cover_photo_url: form.cover_photo_url?.trim() || null,
      cover_focus_y: form.cover_focus_y,
      bio: form.bio.trim(),
      city: form.city?.trim() || null,
      instagram: form.instagram?.trim() || null,
      email: form.email?.trim() || null,
      segmento: form.segmento?.trim() || null,
      creci: form.segmento === REAL_ESTATE_PROFESSION ? form.creci?.trim() || null : null,
      accent_color_hex: form.accent_color_hex || '#3B82F6',
      whatsapp_number: connectedPhone ?? '',
      products: form.products.filter((p) => p.title.trim() || p.description?.trim() || p.photo_url),
      custom_links: form.custom_links.filter((l) => l.label.trim() && l.url.trim()),
      is_published: form.is_published,
    };
    const { error } = await supabase
      .schema('whatsapp_hub')
      .from('agent_sites')
      .upsert(payload, { onConflict: 'org_id' });
    setSaving(false);
    if (error) {
      if (error.code === '23505') {
        toast.error('Esse link já está em uso por outro corretor.', {
          description: 'Escolha outro slug.',
        });
      } else {
        toast.error('Falha ao salvar', { description: error.message });
      }
      return;
    }
    setExists(true);
    setForm((f) => ({ ...f, slug, whatsapp_number: connectedPhone ?? '' }));
    void refreshProfession();
    toast.success('Perfil salvo.');
  };

  const hints = getHints(form.segmento);
  const publicUrl = form.slug ? `${window.location.origin}/c/${form.slug}` : null;
  const { site: previewSite, isPlaceholder: isPreviewPlaceholder } = buildPreviewSite(form, connectedPhone, hints);

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando perfil...
        </div>
      </Card>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6 items-start',
        // A coluna da prévia precisa ACOMPANHAR o toggle Celular/Computador —
        // antes era fixa em 380px sempre, então escolher "Computador" nunca
        // deixava o card realmente largo o suficiente (precisa de >=480px
        // pro AgentSitePreviewCard trocar de layout via ResizeObserver).
        // Bug reportado pelo dono, 2026-09-24: "o modo computador e
        // praticamente igual ao modo celular".
        device === 'mobile' ? 'xl:grid-cols-[1fr_400px]' : 'xl:grid-cols-[1fr_640px]',
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-5 min-w-0">
        <Card>
          <div className="space-y-4">
            <header>
              <h2 className="text-lg font-bold">Vivas Perfil</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Perfil público que seus leads acessam para falar com você no WhatsApp.
              </p>
            </header>

            {/* Capa + avatar — em fluxo normal, um do lado do outro, sem
                sobrepor nada (posicionamento por margem negativa quebrava em
                larguras diferentes). */}
            <div>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e, handleCoverFile)} />
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e, handleAvatarFile)} />
              <div
                className="group relative flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-[rgba(var(--accent-secondary-rgb),0.3)] bg-white/[0.02] bg-cover"
                style={
                  form.cover_photo_url
                    ? { backgroundImage: `url(${form.cover_photo_url})`, backgroundPosition: `center ${form.cover_focus_y}%` }
                    : undefined
                }
              >
                {!form.cover_photo_url && (
                  <span className="text-xs text-[var(--color-text-secondary)]">Sem foto de capa</span>
                )}
                {form.cover_photo_url && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cover_photo_url: '' }))}
                    aria-label="Remover foto de capa"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute bottom-1.5 right-1.5 bg-[rgba(10,10,15,0.7)]"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                >
                  {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Capa
                </Button>
              </div>
              {form.cover_photo_url && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">Posição da capa</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.cover_focus_y}
                    onChange={(e) => setForm((f) => ({ ...f, cover_focus_y: Number(e.target.value) }))}
                    className="h-1.5 flex-1 cursor-pointer accent-[var(--accent-primary)]"
                    aria-label="Posição vertical da foto de capa"
                  />
                  <span className="w-16 shrink-0 text-right text-[11px] text-[var(--color-text-secondary)]">
                    {form.cover_focus_y < 33 ? 'Topo' : form.cover_focus_y > 66 ? 'Base' : 'Centro'}
                  </span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-3">
                {form.photo_url ? (
                  <div className="group relative h-14 w-14 shrink-0">
                    <img src={form.photo_url} alt="Avatar" className="h-full w-full rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}
                      aria-label="Remover foto de perfil"
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-bold">
                    {(form.display_name || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                  {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  Foto de perfil
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome profissional</Label>
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="Seu nome completo"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segmento">Profissão</Label>
                <SearchableSelect
                  id="segmento"
                  value={form.segmento ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, segmento: v }))}
                  options={PROFESSIONS}
                  placeholder="Selecione sua profissão"
                  disabled={saving}
                />
              </div>
              {form.segmento === REAL_ESTATE_PROFESSION && (
                <div className="space-y-2">
                  <Label htmlFor="creci">CRECI</Label>
                  <Input
                    id="creci"
                    value={form.creci ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, creci: e.target.value }))}
                    placeholder="00000-F"
                    disabled={saving}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="whatsapp_display">WhatsApp</Label>
                <Input id="whatsapp_display" value={connectedPhone ?? ''} disabled placeholder="Nenhum número conectado ainda" />
                <p className="text-[11px] text-[var(--color-text-secondary)] opacity-80">
                  {connectedPhone
                    ? 'Esse é o número conectado no Vivas Envia — é ele que a IA atende.'
                    : 'Conecte um número em Vivas Envia para o botão de WhatsApp funcionar.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={form.city ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Fortaleza/CE"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  value={form.instagram ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                  placeholder="@seuperfil"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="voce@email.com"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Endereço permanente</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-text-secondary)] shrink-0">/c/</span>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="seu-nome"
                  disabled={saving}
                />
              </div>
              {publicUrl && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--accent-primary)]">
                    {publicUrl} <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(publicUrl);
                      toast.success('Link copiado.');
                    }}
                    className="hover:text-[var(--accent-primary)]"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Apresentação</Label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Fale um pouco sobre você e seus serviços..."
                rows={3}
                disabled={saving}
                className="flex w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] placeholder:opacity-60 transition-colors focus:border-[var(--accent-primary)] focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 disabled:cursor-not-allowed disabled:opacity-40"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] px-4 py-3">
              <input
                id="accent_color"
                type="color"
                value={form.accent_color_hex}
                onChange={(e) => setForm((f) => ({ ...f, accent_color_hex: e.target.value }))}
                disabled={saving}
                className="h-9 w-14 shrink-0 cursor-pointer rounded-md border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-transparent"
              />
              <div className="min-w-0">
                <Label htmlFor="accent_color">Cor de destaque da página</Label>
                <p className="text-[11px] leading-tight text-[var(--color-text-secondary)]">
                  Cor do botão de WhatsApp e dos destaques da sua página pública — não muda o tema do seu painel.
                </p>
              </div>
            </div>

            {/* ── Links / Botões personalizados ─────────────────────── */}
            <div className="space-y-3 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Botões / Links</Label>
                  <p className="text-[11px] leading-tight text-[var(--color-text-secondary)]">
                    Adicione botões com links personalizados — cada um com sua cor.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      custom_links: [...f.custom_links, { label: '', url: '', color_hex: '#3B82F6' }],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {form.custom_links.length === 0 && (
                <p className="text-sm text-[var(--color-text-secondary)]">Nenhum botão adicionado.</p>
              )}
              {form.custom_links.map((link, li) => (
                <div key={li} className="flex items-start gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02] p-2.5">
                  <input
                    type="color"
                    value={link.color_hex}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        custom_links: f.custom_links.map((l, i) => (i === li ? { ...l, color_hex: e.target.value } : l)),
                      }))
                    }
                    disabled={saving}
                    className="mt-1 h-8 w-10 shrink-0 cursor-pointer rounded border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-transparent"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input
                      value={link.label}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          custom_links: f.custom_links.map((l, i) => (i === li ? { ...l, label: e.target.value } : l)),
                        }))
                      }
                      placeholder="Nome do botão (ex: Meu Site, YouTube)"
                      disabled={saving}
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          custom_links: f.custom_links.map((l, i) => (i === li ? { ...l, url: e.target.value } : l)),
                        }))
                      }
                      placeholder="https://..."
                      disabled={saving}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, custom_links: f.custom_links.filter((_, i) => i !== li) }))}
                    disabled={saving}
                    className="mt-1 rounded p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_published: !f.is_published }))}
              disabled={saving}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                form.is_published
                  ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'border-[rgba(var(--accent-secondary-rgb),0.2)] text-[var(--color-text-secondary)]',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', form.is_published ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-secondary)]')} />
              {form.is_published ? 'Publicado — visível para qualquer visitante' : 'Não publicado — só você vê'}
            </button>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{hints.sectionTitle}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Seu catálogo — aparece como cards no seu site público.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addProduct} disabled={saving}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </header>

            {form.products.length === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)]">Nenhum produto adicionado ainda.</p>
            )}

            <div className="space-y-4">
              {form.products.map((product, i) => (
                <div key={i} className="rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.15)] bg-white/[0.02] p-3">
                  <div className="flex gap-3">
                    <input
                      ref={(el) => {
                        productInputRefs.current[i] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => pickFile(e, (file) => handleProductFile(i, file))}
                    />
                    <button
                      type="button"
                      onClick={() => productInputRefs.current[i]?.click()}
                      disabled={uploadingProduct === i}
                      className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.3)] bg-white/[0.02] bg-cover bg-center"
                      style={product.photo_url ? { backgroundImage: `url(${product.photo_url})` } : undefined}
                    >
                      {!product.photo_url && (
                        uploadingProduct === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-[var(--color-text-secondary)]" />
                      )}
                    </button>
                    <div className="flex-1 space-y-2">
                      <Input
                        value={product.title}
                        onChange={(e) => updateProduct(i, { title: e.target.value })}
                        placeholder={hints.titlePlaceholder}
                        disabled={saving}
                      />
                      <textarea
                        value={product.description ?? ''}
                        onChange={(e) => updateProduct(i, { description: e.target.value })}
                        placeholder={hints.descPlaceholder}
                        rows={2}
                        disabled={saving}
                        className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:opacity-60 focus:border-[var(--accent-primary)] focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <div className="relative w-32 shrink-0">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)]">
                            R$
                          </span>
                          <Input
                            value={centsToInput(product.price_cents)}
                            onChange={(e) => updateProduct(i, { price_cents: inputToCents(e.target.value) })}
                            placeholder="0,00"
                            disabled={saving}
                            inputMode="decimal"
                            className="pl-8"
                          />
                        </div>
                        <Input
                          value={product.url ?? ''}
                          onChange={(e) => updateProduct(i, { url: e.target.value })}
                          placeholder="Link opcional (anúncio, PDF...)"
                          disabled={saving}
                          className="flex-1"
                        />
                      </div>
                      {hints.showAddress && (
                        <div className="flex gap-2">
                          <div className="relative w-28 shrink-0">
                            <Input
                              value={product.cep ?? ''}
                              onChange={(e) => void handleCepChange(i, e.target.value)}
                              placeholder="CEP"
                              disabled={saving}
                              inputMode="numeric"
                            />
                            {cepLoading === i && (
                              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[var(--color-text-secondary)]" />
                            )}
                          </div>
                          <Input
                            value={product.address ?? ''}
                            onChange={(e) => updateProduct(i, { address: e.target.value })}
                            placeholder="Endereço (preenche sozinho pelo CEP)"
                            disabled={saving}
                            className="flex-1"
                          />
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeProduct(i)} disabled={saving} aria-label="Remover produto">
                      <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                    </Button>
                  </div>

                  {/* Características (specs) — pares label/valor, mostrados
                      como chips no painel de detalhe (ex: "Quartos" → "3"). */}
                  <div className="mt-3 space-y-1.5 border-t border-[rgba(var(--accent-secondary-rgb),0.12)] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                        Características (opcional)
                      </span>
                      <button
                        type="button"
                        onClick={() => addSpec(i)}
                        disabled={saving}
                        className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline"
                      >
                        + adicionar
                      </button>
                    </div>
                    {(product.specs ?? []).map((spec, si) => (
                      <div key={si} className="flex items-center gap-1.5">
                        <Input
                          value={spec.label}
                          onChange={(e) => updateSpec(i, si, { label: e.target.value })}
                          placeholder={hints.specLabelPlaceholder}
                          disabled={saving}
                          className="w-28 shrink-0 text-xs"
                        />
                        <Input
                          value={spec.value}
                          onChange={(e) => updateSpec(i, si, { value: e.target.value })}
                          placeholder={hints.specValuePlaceholder}
                          disabled={saving}
                          className="flex-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeSpec(i, si)}
                          disabled={saving}
                          aria-label="Remover característica"
                          className="shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Galeria — fotos extras além da capa do produto, vistas
                      no painel de detalhe. */}
                  <div className="mt-3 space-y-1.5 border-t border-[rgba(var(--accent-secondary-rgb),0.12)] pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Mais fotos (opcional)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(product.gallery ?? []).map((url, gi) => (
                        <div key={url + gi} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeGalleryPhoto(i, gi)}
                            disabled={saving}
                            aria-label="Remover foto"
                            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      ))}
                      <input
                        ref={(el) => {
                          galleryInputRefs.current[i] = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => pickFile(e, (file) => handleProductGalleryFile(i, file))}
                      />
                      <button
                        type="button"
                        onClick={() => galleryInputRefs.current[i]?.click()}
                        disabled={uploadingProduct === i}
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[rgba(var(--accent-secondary-rgb),0.3)] bg-white/[0.02] text-[var(--color-text-secondary)] hover:bg-white/[0.05]"
                        aria-label="Adicionar foto"
                      >
                        {uploadingProduct === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : exists ? (
              'Salvar alterações'
            ) : (
              'Publicar meu perfil'
            )}
          </Button>
        </div>
      </form>

      {/* Prévia ao vivo — campos vazios mostram um EXEMPLO ilustrativo (texto
          cinza claro), só aqui no editor, pra sempre dar pra ver como a
          página completa fica de verdade. A página pública de verdade nunca
          usa esse fallback — só o próprio dado real do corretor. */}
      <div className="xl:sticky xl:top-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-label">Prévia</span>
          <div className="flex items-center gap-1 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                device === 'mobile' ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <Smartphone className="h-3.5 w-3.5" /> Celular
            </button>
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                device === 'desktop' ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-contrast)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              <Monitor className="h-3.5 w-3.5" /> Computador
            </button>
          </div>
        </div>
        <div className={cn('mx-auto transition-all', device === 'mobile' ? 'max-w-[360px]' : 'max-w-xl')}>
          <AgentSitePreviewCard site={previewSite} placeholder={isPreviewPlaceholder} />
        </div>
        {!connectedPhone && (
          <p className="flex items-center gap-1.5 text-xs text-[#FBBF24]">
            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
            O número acima é só exemplo — conecte o WhatsApp de verdade no Vivas
            Envia, senão o botão não aparece pros visitantes.
          </p>
        )}
      </div>
    </div>
  );
}
