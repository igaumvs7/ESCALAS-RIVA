import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/Avatar';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

type Role = 'admin' | 'operator';

// 2026-08-31 (pedido do dono): convite de equipe/atendente tirado do ar por
// enquanto — "não existe isso, só o dono da conta usa" — pode voltar mais
// pra frente, mas hoje não é uma funcionalidade real do produto. Formulário
// de convite e a fila de rodízio (LeadQueueManager, que só fazia sentido com
// mais de 1 membro) foram removidos; a tela só mostra quem já está na conta.
// Backend: invite-team-member Edge Function agora rejeita SEMPRE (não só
// plano Bot) — ver comentário lá. Nenhuma org de produção tinha mais de 1
// membro no momento dessa mudança (conferido no banco antes de mexer).

interface MemberRow {
  id: string;
  role: Role;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  accepted_at: string | null;
}

export function TeamSettings() {
  const { userId } = useAppUser();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const [membersRes, opsRes] = await Promise.all([
        supabase
          .from('app_users')
          .select('id, role, user_id, accepted_at')
          .order('invited_at', { ascending: true }),
        supabase.schema('whatsapp_hub').rpc('list_operators'),
      ]);

      if (cancelled) return;
      if (membersRes.error) {
        toast.error('Não foi possível carregar sua conta', { description: membersRes.error.message });
        setLoading(false);
        return;
      }
      const opByUser = new Map<string, { email: string; display_name: string | null; avatar_url: string | null }>(
        ((opsRes.data ?? []) as Array<{ user_id: string; email: string; display_name: string | null; avatar_url: string | null }>).map(
          (o) => [o.user_id, { email: o.email, display_name: o.display_name, avatar_url: o.avatar_url }],
        ),
      );
      setMembers(
        (membersRes.data ?? []).map((row) => {
          const op = opByUser.get(row.user_id as string);
          return {
            id: row.id as string,
            role: row.role as Role,
            user_id: row.user_id as string,
            email: op?.email ?? null,
            display_name: op?.display_name ?? null,
            avatar_url: op?.avatar_url ?? null,
            accepted_at: (row.accepted_at as string | null) ?? null,
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <div className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-bold text-display">Equipe</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Por enquanto, só o dono da conta usa o sistema — convidar mais gente não está
            disponível no momento.
          </p>
        </header>

        <div className="space-y-2">
          <div className="text-label">Quem usa esta conta</div>
          {loading ? (
            <div className="text-sm text-[var(--color-text-secondary)] opacity-60">Carregando...</div>
          ) : (
            <ul className="divide-y divide-[rgba(var(--accent-secondary-rgb),0.08)] rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.1)] bg-white/[0.02]">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between p-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={m.avatar_url} name={m.display_name ?? m.email} size="sm" />
                    <div className="text-sm min-w-0">
                      <div className="text-[var(--color-text-primary)] truncate max-w-[280px]">
                        {m.display_name?.trim() || m.email || m.user_id}
                      </div>
                      <div className="text-[var(--color-text-secondary)] text-xs truncate max-w-[280px]">
                        {m.display_name?.trim() && m.email ? m.email : ''}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs uppercase tracking-wide font-semibold text-[var(--accent-primary)]">
                    Dono da conta
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
