import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/Avatar';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { PROFESSIONS } from '@/lib/professions';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/app/providers/AuthProvider';
import { useAppUser } from '@/app/providers/AppUserProvider';

const AVATAR_BUCKET = 'whatsapp-hub-avatars';
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function AccountSettings() {
  const { user } = useAuth();
  const {
    userId,
    orgId,
    role,
    isSuperAdmin,
    orgName,
    displayName,
    avatarUrl,
    profession,
    refreshProfile,
    refreshProfession,
  } = useAppUser();
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // ----------------------------------------------------------------------
  // Autenticação em duas etapas (TOTP via supabase.auth.mfa) — pedido do
  // dono, 2026-09-21: só faz sentido exigir pra contas com poder de verdade
  // (admin da org / super admin), não pra operador comum. A ativação usa a
  // API de MFA que o próprio Supabase já oferece pronta (sem depender de
  // nenhum serviço externo), e o servidor reforça isso de novo em
  // src/lib/admin-auth.ts + supabase/functions/_shared/auth.ts — mesmo que
  // alguém pule essa tela, uma ação de admin sem o código confirmado nesta
  // sessão é recusada.
  // ----------------------------------------------------------------------
  const canUseTwoFactor = role === 'admin' || isSuperAdmin;
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string | null }[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyingEnroll, setVerifyingEnroll] = useState(false);
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    setLoadingFactors(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoadingFactors(false);
    if (error) return;
    setFactors((data?.totp ?? []).filter((f) => f.status === 'verified'));
  }, []);

  useEffect(() => {
    if (canUseTwoFactor) void loadFactors();
  }, [canUseTwoFactor, loadFactors]);

  const handleStartEnroll = async () => {
    setEnrolling(true);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setEnrolling(false);
    if (error || !data) {
      toast.error('Não foi possível iniciar a ativação', { description: error?.message });
      return;
    }
    setEnrollData({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const handleCancelEnroll = async () => {
    if (enrollData) {
      const supabase = getSupabase();
      await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId });
    }
    setEnrollData(null);
    setVerifyCode('');
  };

  const handleVerifyEnroll = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;
    setVerifyingEnroll(true);
    const supabase = getSupabase();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollData.factorId,
    });
    if (challengeError || !challenge) {
      setVerifyingEnroll(false);
      toast.error('Falha ao gerar o desafio', { description: challengeError?.message });
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollData.factorId,
      challengeId: challenge.id,
      code: verifyCode.trim(),
    });
    setVerifyingEnroll(false);
    if (verifyError) {
      toast.error('Código inválido', { description: verifyError.message });
      return;
    }
    toast.success('Autenticação em duas etapas ativada.');
    setEnrollData(null);
    setVerifyCode('');
    await loadFactors();
  };

  const handleRemoveFactor = async (factorId: string) => {
    setRemovingFactorId(factorId);
    const supabase = getSupabase();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setRemovingFactorId(null);
    if (error) {
      toast.error('Falha ao desativar', { description: error.message });
      return;
    }
    toast.success('Autenticação em duas etapas desativada.');
    await loadFactors();
  };

  // Profissão (whatsapp_hub.agent_sites.segmento — mesmo campo do Vivas
  // Perfil). Só admin tem permissão de escrita ali (RLS agent_sites_admin_write),
  // então operador vê a seção mas não consegue salvar.
  const [segmento, setSegmento] = useState(profession ?? '');
  const [savingSegmento, setSavingSegmento] = useState(false);

  useEffect(() => {
    setSegmento(profession ?? '');
  }, [profession]);

  const handleSaveSegmento = async () => {
    if (!orgId) return;
    setSavingSegmento(true);
    const supabase = getSupabase();
    const { data: updated, error: updateError } = await supabase
      .schema('whatsapp_hub')
      .from('agent_sites')
      .update({ segmento: segmento || null })
      .eq('org_id', orgId)
      .select('org_id');
    if (!updateError && (!updated || updated.length === 0)) {
      // Org sem agent_sites ainda (bootstrap/convite) — cria uma linha
      // mínima só pra guardar a profissão; o resto do perfil público
      // continua editável em Vivas Perfil.
      const fallbackSlug = `perfil-${orgId.slice(0, 8)}`;
      const { error: insertError } = await supabase
        .schema('whatsapp_hub')
        .from('agent_sites')
        .insert({
          org_id: orgId,
          slug: fallbackSlug,
          display_name: orgName || '',
          segmento: segmento || null,
        });
      setSavingSegmento(false);
      if (insertError) {
        toast.error('Falha ao salvar profissão', { description: insertError.message });
        return;
      }
    } else {
      setSavingSegmento(false);
      if (updateError) {
        toast.error('Falha ao salvar profissão', { description: updateError.message });
        return;
      }
    }
    await refreshProfession();
    toast.success('Profissão atualizada.');
  };

  // Perfil (nome de exibição + foto). O nome inicial vem do provider; sincroniza
  // quando o perfil recarrega.
  const [name, setName] = useState(displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(displayName ?? '');
  }, [displayName]);

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSavingName(true);
    const supabase = getSupabase();
    const { error } = await supabase
      .schema('whatsapp_hub')
      .from('app_users')
      .update({ display_name: name.trim() || null })
      .eq('user_id', userId);
    setSavingName(false);
    if (error) {
      toast.error('Falha ao salvar nome', { description: error.message });
      return;
    }
    await refreshProfile();
    toast.success('Nome de exibição atualizado.');
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
    if (!file || !userId || !orgId) return;

    const ext = AVATAR_MIME_EXT[file.type];
    if (!ext) {
      toast.error('Formato inválido', { description: 'Envie uma imagem PNG, JPEG ou WEBP.' });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('Imagem muito grande', { description: 'O tamanho máximo é 2MB.' });
      return;
    }

    setUploadingAvatar(true);
    const supabase = getSupabase();
    // Path OBRIGATÓRIO pelas policies do bucket: <org_id>/<user_id>.<ext>
    const path = `${orgId}/${userId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingAvatar(false);
      toast.error('Falha no upload', { description: upErr.message });
      return;
    }
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    // Cache-buster: como o path é fixo por user, força o browser a recarregar.
    const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updErr } = await supabase
      .schema('whatsapp_hub')
      .from('app_users')
      .update({ avatar_url: publicUrl })
      .eq('user_id', userId);
    setUploadingAvatar(false);
    if (updErr) {
      toast.error('Falha ao salvar foto', { description: updErr.message });
      return;
    }
    await refreshProfile();
    toast.success('Foto de perfil atualizada.');
  };

  const handleRemoveAvatar = async () => {
    if (!userId || !orgId || removingAvatar) return;
    setRemovingAvatar(true);
    const supabase = getSupabase();
    // Melhor esforço: apaga o arquivo do storage (não bloqueia a remoção se
    // falhar — o path é previsível, mas o registro no banco é o que importa
    // de verdade pra tela parar de mostrar a foto).
    for (const ext of Object.values(AVATAR_MIME_EXT)) {
      await supabase.storage.from(AVATAR_BUCKET).remove([`${orgId}/${userId}.${ext}`]);
    }
    const { error } = await supabase
      .schema('whatsapp_hub')
      .from('app_users')
      .update({ avatar_url: null })
      .eq('user_id', userId);
    setRemovingAvatar(false);
    if (error) {
      toast.error('Falha ao remover foto', { description: error.message });
      return;
    }
    await refreshProfile();
    toast.success('Foto de perfil removida.');
  };

  // Trocar de senha exige confirmação por e-mail (pedido do dono) — em vez de
  // digitar a senha nova direto aqui, manda o mesmo link de redefinição da
  // tela de login ("Esqueci minha senha") pro próprio e-mail da conta. Só
  // quem tem acesso à caixa de entrada consegue de fato trocar a senha.
  const handleSendResetLink = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/invite`,
    });
    setSendingReset(false);
    if (error) {
      toast.error('Não foi possível enviar o e-mail', { description: error.message });
      return;
    }
    setResetSent(true);
    toast.success('E-mail enviado', {
      description: `Enviamos um link para ${user.email}. Abra-o para criar uma nova senha.`,
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">Perfil</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Nome e foto exibidos no seu perfil dentro do sistema.
            </p>
          </header>
          <div className="flex items-center gap-4">
            <div className="group relative h-16 w-16 shrink-0">
              <Avatar src={avatarUrl} name={name || user?.email} size="lg" />
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                  disabled={removingAvatar || uploadingAvatar}
                  aria-label="Remover foto de perfil"
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                >
                  {removingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Trash2 className="h-5 w-5 text-white" />
                  )}
                </button>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Trocar foto
                  </>
                )}
              </Button>
              <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
                PNG, JPEG ou WEBP · máx 2MB
              </p>
            </div>
          </div>
          <form onSubmit={handleSaveName} className="space-y-2">
            <Label htmlFor="display_name">Nome de exibição</Label>
            <div className="flex gap-2">
              <Input
                id="display_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como seu nome aparece no sistema"
                disabled={savingName}
              />
              <Button type="submit" disabled={savingName || name.trim() === (displayName ?? '')}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">Profissão</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Aparece no rodapé do menu lateral e no seu Vivas Perfil público.
            </p>
          </header>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={segmento}
                onChange={setSegmento}
                options={PROFESSIONS}
                placeholder="Selecione sua profissão"
                disabled={savingSegmento || role !== 'admin'}
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleSaveSegmento()}
              disabled={savingSegmento || role !== 'admin' || segmento === (profession ?? '')}
            >
              {savingSegmento ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
          {role !== 'admin' && (
            <p className="text-xs text-[var(--color-text-secondary)] opacity-80">
              Só o administrador da organização pode alterar a profissão.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">E-mail</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-mono text-[var(--color-text-primary)]">{user?.email ?? '—'}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] opacity-80">
              Não é possível trocar o e-mail por aqui. Fale com o suporte se precisar mudar.
            </p>
          </header>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <header>
            <h2 className="text-lg font-bold">Senha</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Por segurança, a troca de senha é confirmada por e-mail — sem digitar
              senha nova aqui.
            </p>
          </header>
          <Button type="button" onClick={() => void handleSendResetLink()} disabled={sendingReset}>
            {sendingReset ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Enviar link de redefinição para meu e-mail
              </>
            )}
          </Button>
          {resetSent && (
            <p className="text-xs text-[var(--color-success)]">
              Link enviado para {user?.email}. Confira sua caixa de entrada (e o spam).
            </p>
          )}
        </div>
      </Card>

      {canUseTwoFactor && (
        <Card>
          <div className="space-y-4">
            <header>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--accent-primary)]" />
                Autenticação em duas etapas
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Sua conta tem permissão de administrador. Recomendamos ativar uma
                segunda camada de proteção: além da senha, você confirma um código do
                seu app autenticador (Google Authenticator, Authy, etc.) a cada login
                novo.
              </p>
            </header>

            {loadingFactors ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-secondary)]" />
            ) : factors.length > 0 ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm text-[var(--color-success)]">
                  <ShieldCheck className="h-4 w-4" /> Ativada
                </p>
                {factors.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    <span className="text-sm">{f.friendly_name || 'App autenticador'}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleRemoveFactor(f.id)}
                      disabled={removingFactorId === f.id}
                    >
                      {removingFactorId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Desativar'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : enrollData ? (
              <form onSubmit={handleVerifyEnroll} className="space-y-3">
                <img
                  src={enrollData.qr}
                  alt="QR code para configurar o app autenticador"
                  className="mx-auto h-40 w-40 rounded-lg bg-white p-2"
                />
                <p className="text-center text-xs text-[var(--color-text-secondary)]">
                  Escaneie com seu app autenticador, ou digite o código manualmente:
                  <span className="mt-1 block break-all font-mono">{enrollData.secret}</span>
                </p>
                <div className="mx-auto flex max-w-xs gap-2">
                  <Input
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    placeholder="Código de 6 dígitos"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    disabled={verifyingEnroll}
                  />
                  <Button type="submit" disabled={verifyingEnroll || verifyCode.trim().length < 6}>
                    {verifyingEnroll ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCancelEnroll()}
                  className="mx-auto block text-xs text-[var(--color-text-secondary)] hover:underline"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <Button type="button" onClick={() => void handleStartEnroll()} disabled={enrolling}>
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ativar autenticação em duas etapas'}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
