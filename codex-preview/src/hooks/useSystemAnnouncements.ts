import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

// ----------------------------------------------------------------------------
// useSystemAnnouncements — aba "Sistema" das notificações (pedido do dono:
// "toda atualização do sistema que eu fizer ou eu quiser escrever algo pra
// mandar pra todos... a pessoa possa clicar e ler melhor"). Comunicado é
// GLOBAL — não segue org_id como o resto do schema — todo usuário
// autenticado de qualquer organização enxerga todos. Só o super admin
// escreve (RLS: whatsapp_hub.system_announcements_insert).
// ----------------------------------------------------------------------------

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  created_by: string;
  created_at: string;
}

export function useSystemAnnouncements() {
  const { userId } = useAppUser();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabase();
    const [{ data: rows }, readsRes] = await Promise.all([
      supabase
        .schema('whatsapp_hub')
        .from('system_announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      userId
        ? supabase.schema('whatsapp_hub').from('system_announcement_reads').select('announcement_id').eq('user_id', userId)
        : Promise.resolve({ data: [] as { announcement_id: string }[] }),
    ]);
    setAnnouncements((rows ?? []) as AnnouncementRow[]);
    setReadIds(new Set(((readsRes.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: qualquer comunicado novo, de qualquer usuário — global, sem filtro.
  useEffect(() => {
    const supabase = getSupabase();
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`system_announcements:${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'whatsapp_hub', table: 'system_announcements' },
        (payload) => {
          const row = payload.new as AnnouncementRow;
          setAnnouncements((prev) => (prev.some((a) => a.id === row.id) ? prev : [row, ...prev]));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      if (!userId || readIds.has(id)) return;
      setReadIds((prev) => new Set(prev).add(id));
      const supabase = getSupabase();
      await supabase
        .schema('whatsapp_hub')
        .from('system_announcement_reads')
        .upsert({ announcement_id: id, user_id: userId }, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
    },
    [userId, readIds],
  );

  const create = useCallback(
    async (title: string, body: string, imageUrl?: string | null) => {
      const supabase = getSupabase();
      const { error } = await supabase.schema('whatsapp_hub').from('system_announcements').insert({
        title: title.trim(),
        body: body.trim(),
        image_url: imageUrl || null,
      });
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;

  return { announcements, readIds, unreadCount, loading, markRead, create, reload };
}

const ANNOUNCEMENT_BUCKET = 'whatsapp-hub-announcements';

export async function uploadAnnouncementImage(file: File): Promise<string> {
  const supabase = getSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(ANNOUNCEMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(ANNOUNCEMENT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
