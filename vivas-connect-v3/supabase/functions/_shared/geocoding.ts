// ============================================================================
// _shared/geocoding.ts
// ----------------------------------------------------------------------------
// Geocodificação gratuita via Nominatim (OpenStreetMap) — sem chave de API,
// sem custo. Pedido do dono (2026-09-06): "quero de forma gratuita, eu não
// quero pagar por isso... procure alguma API de mapa, algo simples".
//
// Usado em dois pontos:
// 1. Tela "Mídias do agente" (AgentMediaSettings.tsx via Edge Function
//    geocode-lookup) — corretor digita o bairro/endereço da mídia (ex.: foto
//    de destaque de um empreendimento) e o sistema resolve lat/lng sozinho.
// 2. process-ai-message — quando o cliente menciona querer algo "perto de
//    <lugar>", geocodifica esse lugar e calcula a distância REAL (Haversine)
//    até cada mídia com localização cadastrada, pra nunca deixar a IA
//    "chutar" a distância (pedido explícito do dono: "é uma prioridade...
//    se a gente calcula errado, é uma venda perdida").
//
// Política de uso do Nominatim exige um User-Agent identificável (não o
// default do runtime) e no máximo ~1 req/s — nosso volume (geocodificar uma
// mídia no cadastro, ou um lugar mencionado por mensagem) fica bem abaixo
// disso.
// ============================================================================

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'VivasConnect/1.0 (contato@vivasconnect.com.br)';

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

// Bug real encontrado em teste (2026-09-06): o Nominatim NÃO reconhece o
// prefixo genérico "bairro" na frase — "Bairro Fátima, Fortaleza" retorna
// vazio, mas "Fátima, Fortaleza" resolve certinho (confirmado contra a API
// de verdade pra "Fátima", "Cocó" e "Aldeota", todos em Fortaleza). Como é
// exatamente assim que qualquer corretor brasileiro vai escrever ("bairro
// tal, cidade tal"), sem esse strip a geocodificação falharia na prática
// quase sempre.
function stripBairroPrefix(query: string): string {
  return query.replace(/^\s*bairro\s+(do|da|de)?\s*/i, '').trim();
}

// Restringe ao Brasil (countrycodes=br) — reduz colisão de nomes de bairro
// comuns (ex.: "Fátima" existe em várias cidades/países) sem precisar saber a
// cidade da org.
export async function geocodePlace(query: string): Promise<GeocodeResult | null> {
  const trimmed = stripBairroPrefix(query.trim());
  if (!trimmed) return null;

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status}`);
  }
  const body = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const first = body[0];
  if (!first) return null;

  const lat = Number.parseFloat(first.lat);
  const lon = Number.parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon, displayName: first.display_name };
}

// Distância em km entre dois pontos (fórmula de Haversine) — cálculo
// determinístico, nunca estimado pela IA.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // raio médio da Terra em km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Frases-gatilho de intenção de proximidade em português — só dispara o
// custo extra de geocodificar quando faz sentido, não em toda mensagem.
const PROXIMITY_TRIGGERS = [
  'perto de', 'perto da', 'perto do',
  'próximo a', 'próximo à', 'próximo de', 'próximo do',
  'próxima a', 'próxima à', 'próxima de',
  'mais perto', 'mais próximo', 'mais próxima',
  'ao lado de', 'ao lado do', 'ao lado da',
  'na região de', 'nas redondezas de', 'perto da região',
];

// Remove artigo/conector solto que sobra quando o gatilho casa uma forma
// contraída (ex.: gatilho "próximo a" dentro de "próximo AO bairro Fátima"
// deixa o "o" solto no começo; "mais próximo" dentro de "mais próximo DA
// Aldeota" deixa "da"). Aplicado 2x de propósito — cobre o raro caso de
// duas sobras em sequência.
function stripLeadingConnector(s: string): string {
  const re = /^(a|à|o|ao|da|do|de|na|no|em|para|pra)\s+/i;
  return s.replace(re, '').replace(re, '').trim();
}

// Extrai o trecho de lugar mencionado após um gatilho de proximidade (ex.:
// "eu quero um empreendimento perto da Praia do Futuro" → "Praia do
// Futuro"). Heurística simples (não é NLP de verdade): pega até pontuação
// forte ou fim da frase. Retorna null se nenhum gatilho for encontrado.
export function extractProximityQuery(message: string): string | null {
  const lower = message.toLowerCase();
  for (const trigger of PROXIMITY_TRIGGERS) {
    const idx = lower.indexOf(trigger);
    if (idx === -1) continue;
    const after = message.slice(idx + trigger.length);
    const match = after.match(/^\s*([^.!?\n,;]+)/);
    const place = stripLeadingConnector(match?.[1]?.trim() ?? '');
    if (place && place.length >= 2) return place;
  }
  return null;
}
