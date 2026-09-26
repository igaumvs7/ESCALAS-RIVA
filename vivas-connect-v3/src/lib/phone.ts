import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Normalize a raw phone input to E.164 (+55…). Used by contact CRUD and the
// CSV importer to reject or repair input consistently across the app.
//
// Defaults country code to BR — change via the second arg when we internationalize.
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = 'BR',
): { ok: true; e164: string } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'Telefone vazio — a linha não tinha nenhum número.' };
  const cleaned = raw.trim();
  try {
    const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) {
      // Mensagem com o valor real que falhou + um exemplo do formato certo
      // (pedido do dono: "quero um exemplo do porque deu inválido").
      return {
        ok: false,
        error: `Número inválido: "${cleaned}" — no Brasil, um celular tem DDD + 9 dígitos (ex.: 85987654321 ou (85) 98765-4321). Confira se não falta o "9" ou algum dígito.`,
      };
    }
    return { ok: true, e164: parsed.format('E.164') };
  } catch {
    return {
      ok: false,
      error: `Não deu pra ler "${cleaned}" como telefone — confira o formato (ex.: 85987654321).`,
    };
  }
}
