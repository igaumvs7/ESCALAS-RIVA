import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/app/providers/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { validateEmailFormat, translateAuthError } from '@/lib/authErrors';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Segunda etapa (2FA) — só aparece pra quem JÁ ativou autenticação em duas
  // etapas em Configurações > Conta (hoje, só admin/superadmin veem essa
  // opção). Login com senha certa entrega uma sessão "aal1"; sem confirmar o
  // código aqui, a sessão nunca sobe pra "aal2" e o servidor recusa qualquer
  // ação de admin (ver src/lib/admin-auth.ts).
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const emailError = validateEmailFormat(email);
    if (emailError) {
      toast.error(emailError);
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setSubmitting(false);
      toast.error('Não foi possível entrar', { description: translateAuthError(error) });
      return;
    }

    const supabase = getSupabase();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setSubmitting(false);
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const factor = factorsData?.totp?.[0];
      if (factor) {
        setMfaFactorId(factor.id);
        return;
      }
    }
    navigate('/dashboard', { replace: true });
  };

  const handleVerifyMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!mfaFactorId) return;
    setVerifyingMfa(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: mfaCode.trim(),
    });
    setVerifyingMfa(false);
    if (error) {
      toast.error('Código inválido', { description: error.message });
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  // Esqueci minha senha: dispara o e-mail de recuperação do Supabase. O link
  // aponta para /invite (mesma tela reusa updateUser p/ definir nova senha) no
  // domínio atual (produção na Vercel).
  const handleForgotPassword = async () => {
    const target = email.trim();
    if (!target) {
      toast.error('Informe seu e-mail no campo acima para redefinir a senha.');
      return;
    }
    setResetting(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/invite`,
    });
    setResetting(false);
    if (error) {
      toast.error('Não foi possível enviar o e-mail de redefinição', {
        description: translateAuthError(error.message),
      });
      return;
    }
    toast.success('E-mail de redefinição enviado', {
      description: `Enviamos um link para ${target}. Abra-o para criar uma nova senha.`,
    });
  };

  if (mfaFactorId) {
    return (
      <AuthShell
        title="Confirme sua identidade"
        subtitle="Digite o código do seu app autenticador para continuar."
      >
        <form onSubmit={handleVerifyMfa} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="mfa_code">Código de 6 dígitos</Label>
            <Input
              id="mfa_code"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              required
              disabled={verifyingMfa}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={verifyingMfa || mfaCode.trim().length < 6}
          >
            {verifyingMfa ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              <>Confirmar</>
            )}
          </Button>
          <button
            type="button"
            onClick={() => setMfaFactorId(null)}
            className="mx-auto block text-xs text-[var(--color-text-secondary)] hover:underline"
          >
            Voltar
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse seu painel VIVAS CONNECT."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link
            to="/auth/signup"
            className="text-[var(--accent-primary)] hover:underline font-medium"
          >
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetting || submitting}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline disabled:opacity-60"
            >
              {resetting ? 'Enviando...' : 'Esqueci minha senha'}
            </button>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            <>Entrar</>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
