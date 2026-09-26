// ----------------------------------------------------------------------------
// Validação client-side + tradução de erros de auth pro português, usadas em
// LoginPage e SignupPage. Centralizado aqui pra não duplicar regex/mensagem.
// ----------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailFormat(email: string): string | null {
  if (!EMAIL_RE.test(email.trim())) {
    return 'E-mail inválido. Confira se digitou certo.';
  }
  return null;
}

// Exige 8+ caracteres, pelo menos uma letra e pelo menos um número. Regra
// vale SEMPRE que uma senha nova é definida — cadastro (SignupPage) e
// aceitar convite/redefinir senha (InvitePage, que atende os dois casos).
export const PASSWORD_RULE_HINT = 'Mínimo 8 caracteres, com letra e número.';

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha precisa ter letras e números.';
  }
  return null;
}

// Checa a senha contra o HaveIBeenPwned (banco de senhas já vazadas em
// invasões conhecidas) — mesma proteção que o Supabase oferece só no plano
// Pro, feita aqui de graça: a API "Pwned Passwords" é pública e não exige
// chave (dono, 2026-08-31: "a gente não conseguia criar um próprio nosso?").
// Modelo k-Anonymity: só os 5 primeiros caracteres do hash SHA-1 da senha
// saem do navegador — a senha em si nunca é enviada pra lugar nenhum.
// Se a checagem falhar (sem internet, API fora do ar), NÃO bloqueia o
// cadastro por causa disso — falha "aberta", pra não travar gente de
// verdade tentando criar conta por um serviço externo instável.
async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function isPasswordLeaked(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch {
    return false;
  }
}

const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar — cheque sua caixa de entrada.'],
  [/user already registered/i, 'Esse e-mail já está cadastrado.'],
  [/unable to validate email address/i, 'E-mail inválido. Confira se digitou certo.'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres.'],
  [/rate limit/i, 'Muitas tentativas seguidas. Espera um minuto e tenta de novo.'],
  [/network/i, 'Falha de conexão. Confira sua internet e tenta de novo.'],
];

export function translateAuthError(message: string): string {
  const found = KNOWN_MESSAGES.find(([re]) => re.test(message));
  return found ? found[1] : message;
}
