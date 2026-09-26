import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PulseRadar } from '@/components/ui/PulseRadar';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/app/providers/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import {
  validateEmailFormat,
  validatePasswordStrength,
  translateAuthError,
  isPasswordLeaked,
  PASSWORD_RULE_HINT,
} from '@/lib/authErrors';
import { PROFESSIONS, REAL_ESTATE_PROFESSION } from '@/lib/professions';
import { normalizePhone } from '@/lib/phone';

type SignupStatus =
  | { state: 'loading' }
  | { state: 'open' } // primeiro user — vira owner da instância
  | { state: 'new_org' } // instância já tem owner — cria org própria (corretor)
  | { state: 'error'; message: string };

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgName, setOrgName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [segmento, setSegmento] = useState('');
  const [creci, setCreci] = useState('');

  const whatsappPreview = useMemo(() => {
    if (!whatsapp.trim()) return null;
    return normalizePhone(whatsapp);
  }, [whatsapp]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<SignupStatus>({ state: 'loading' });
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const pendingCreds = useRef<{ email: string; password: string } | null>(null);

  // Enquanto aguarda confirmação de e-mail, tenta logar a cada poucos segundos
  // com as mesmas credenciais — antes de confirmar, o Supabase recusa com
  // "Email not confirmed"; assim que confirma, o login funciona e a gente
  // já entra direto, sem precisar mandar a pessoa pra tela de login de novo.
  useEffect(() => {
    if (!awaitingConfirmation || !pendingCreds.current) return;
    const creds = pendingCreds.current;
    let cancelled = false;

    const interval = setInterval(async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.signInWithPassword(creds);
      if (cancelled || !data.session) return;
      await supabase.auth.refreshSession();
      await supabase.auth.signOut({ scope: 'others' });
      toast.success('E-mail confirmado! Entrando...');
      navigate('/dashboard', { replace: true });
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [awaitingConfirmation, navigate]);

  const handleResend = async () => {
    if (!pendingCreds.current) return;
    setResending(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({ type: 'signup', email: pendingCreds.current.email });
    setResending(false);
    if (error) {
      toast.error('Não foi possível reenviar', { description: translateAuthError(error.message) });
      return;
    }
    toast.success('E-mail reenviado.');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('signup_status');
      if (cancelled) return;
      if (error) {
        setStatus({ state: 'error', message: error.message });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.first_user_pending) {
        setStatus({ state: 'open' });
      } else {
        setStatus({ state: 'new_org' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (status.state === 'new_org' && !orgName.trim()) {
      toast.error('Informe seu nome e sobrenome.');
      return;
    }
    if (status.state === 'new_org' && (!whatsappPreview || !whatsappPreview.ok)) {
      toast.error('Informe um número de WhatsApp válido.', {
        description: whatsappPreview && !whatsappPreview.ok ? whatsappPreview.error : undefined,
      });
      return;
    }
    const emailError = validateEmailFormat(email);
    if (emailError) {
      toast.error(emailError);
      return;
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (password !== confirm) {
      toast.error('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    if (await isPasswordLeaked(password)) {
      setSubmitting(false);
      toast.error('Essa senha não é segura', {
        description: 'Ela já apareceu em vazamentos conhecidos na internet — escolha outra.',
      });
      return;
    }
    const metadata =
      status.state === 'new_org'
        ? {
            signup_new_org: 'true',
            org_name: orgName.trim(),
            whatsapp: whatsappPreview && whatsappPreview.ok ? whatsappPreview.e164 : '',
            segmento: segmento || '',
            creci: segmento === REAL_ESTATE_PROFESSION ? creci.trim() : '',
          }
        : undefined;
    const { error, sessionCreated, emailAlreadyExists } = await signUp(email.trim(), password, metadata);
    setSubmitting(false);

    if (error) {
      toast.error('Não foi possível criar a conta', { description: translateAuthError(error) });
      return;
    }
    if (!sessionCreated) {
      if (emailAlreadyExists) {
        toast.error('Esse e-mail já está cadastrado', {
          description: 'Tente entrar com a senha dessa conta, ou use "Esqueci minha senha" no login.',
        });
        return;
      }
      // Precisa confirmar e-mail: guarda as credenciais só em memória (não
      // persiste em lugar nenhum) pra tentar logar sozinho a cada poucos
      // segundos, e muda pra tela de espera em vez de só avisar por toast.
      pendingCreds.current = { email: email.trim(), password };
      setAwaitingConfirmation(true);
      return;
    }
    toast.success('Conta criada. Bem-vindo!');
    navigate('/dashboard', { replace: true });
  };

  if (awaitingConfirmation) {
    return (
      <AuthShell
        title="Confirme seu e-mail"
        subtitle={`Enviamos um link para ${pendingCreds.current?.email}.`}
      >
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <PulseRadar>
            <Mail className="h-6 w-6 text-[var(--accent-gold)]" />
          </PulseRadar>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
            Assim que você clicar no link do e-mail, essa tela detecta sozinha e
            já entra no seu painel — não precisa fazer mais nada aqui.
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verificando automaticamente...
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reenviando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Reenviar e-mail
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={() => setAwaitingConfirmation(false)}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2"
          >
            Usar outro e-mail
          </button>
        </div>
      </AuthShell>
    );
  }

  if (status.state === 'loading') {
    return (
      <AuthShell title="Criar conta" subtitle="Verificando status da instância...">
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-primary)]" />
        </div>
      </AuthShell>
    );
  }

  if (status.state === 'new_org') {
    return (
      <AuthShell
        title="Criar minha conta"
        subtitle="Você ganha sua própria organização, isolada de todo mundo."
        footer={
          <>
            Já tem conta?{' '}
            <Link
              to="/auth/login"
              className="text-[var(--accent-primary)] hover:underline font-medium"
            >
              Entrar
            </Link>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="org_name">Nome e sobrenome</Label>
            <Input
              id="org_name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ex: João Silva"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 91234-5678"
              required
              disabled={submitting}
            />
            {whatsappPreview && (
              <p className={`text-xs ${whatsappPreview.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {whatsappPreview.ok ? `Confirmado: ${whatsappPreview.e164}` : whatsappPreview.error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="segmento">Segmento</Label>
            <SearchableSelect
              id="segmento"
              value={segmento}
              onChange={setSegmento}
              options={PROFESSIONS}
              placeholder="Selecione (opcional)"
              disabled={submitting}
            />
          </div>

          {segmento === REAL_ESTATE_PROFESSION && (
            <div className="space-y-2">
              <Label htmlFor="creci">Número do CRECI (opcional)</Label>
              <Input
                id="creci"
                value={creci}
                onChange={(e) => setCreci(e.target.value)}
                placeholder="Ex: 12345-F"
                disabled={submitting}
              />
            </div>
          )}

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
            <Label htmlFor="password">Senha</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              minLength={8}
            />
            <p className="text-xs text-[var(--color-text-secondary)] opacity-80">{PASSWORD_RULE_HINT}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={submitting}
              minLength={8}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando conta...
              </>
            ) : (
              <>Criar conta</>
            )}
          </Button>
        </form>
      </AuthShell>
    );
  }

  if (status.state === 'error') {
    return (
      <AuthShell
        title="Erro"
        subtitle="Não consegui consultar o status da instância."
      >
        <p className="text-sm text-[var(--color-error)]">{status.message}</p>
      </AuthShell>
    );
  }

  // status.state === 'open' → primeiro usuário (vira owner).
  return (
    <AuthShell
      title="Criar owner desta instância"
      subtitle="Você é o primeiro usuário — sua conta vira o owner automaticamente."
      footer={
        <>
          Já tem conta?{' '}
          <Link
            to="/auth/login"
            className="text-[var(--accent-primary)] hover:underline font-medium"
          >
            Entrar
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
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
            minLength={8}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={submitting}
            minLength={8}
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando conta...
            </>
          ) : (
            <>Criar owner</>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
