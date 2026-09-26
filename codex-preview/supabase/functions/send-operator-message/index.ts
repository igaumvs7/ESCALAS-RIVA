// ============================================================================
// send-operator-message
// ----------------------------------------------------------------------------
// Operator or admin replies inside a conversation. We ALWAYS persist the
// message (so UI updates optimistically via realtime) and then hand off to
// sendInboxWithResolve, que confirma o canal webjs e devolve null de
// propósito — o worker separado (webjs-worker) faz o envio real por
// polling. is_private_note=true bypassa isso: notas privadas são internas
// e nunca tocam o WhatsApp.
// ============================================================================

import { requireOrgCaller, AuthError } from '../_shared/auth.ts';
import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { sendInboxWithResolve } from '../_shared/inbox-delivery.ts';

interface Payload {
  conversation_id?: string;
  content?: string;
  is_private_note?: boolean;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const caller = await requireOrgCaller(req);
    if (caller.role !== 'admin' && caller.role !== 'operator') {
      return jsonResponse({ ok: false, error: 'Sem permissão para enviar mensagens.' }, { status: 403 });
    }

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const conversationId = body.conversation_id?.trim();
    const content = (body.content ?? '').trim();
    const isPrivate = Boolean(body.is_private_note);

    if (!conversationId) return jsonResponse({ ok: false, error: 'conversation_id ausente.' }, { status: 400 });
    if (!content) return jsonResponse({ ok: false, error: 'Conteúdo vazio.' }, { status: 400 });

    // Meta Cloud API rejeita mensagens > 4096 caracteres no body de texto.
    // Notas privadas seguem o mesmo limite por consistência (e para evitar
    // BLOBs gigantes ocupando a tabela messages).
    const MAX_CONTENT_LENGTH = 4096;
    if (content.length > MAX_CONTENT_LENGTH) {
      return jsonResponse(
        { ok: false, error: `Conteúdo excede ${MAX_CONTENT_LENGTH} caracteres (limite da Meta Cloud API).` },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, org_id, contact_id, status, channel, channel_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (convErr) return jsonResponse({ ok: false, error: convErr.message }, { status: 500 });
    if (!conv) {
      return jsonResponse({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });
    }
    // Cross-check de org: a conversa deve pertencer à org do caller.
    if ((conv as { org_id: string }).org_id !== caller.orgId) {
      return jsonResponse({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });
    }

    // Insert the message row first. UI gets it from realtime immediately.
    const { data: inserted, error: insErr } = await admin
      .from('messages')
      .insert({
        org_id: caller.orgId,
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'operator',
        sender_id: caller.userId,
        content_type: isPrivate ? 'note' : 'text',
        content,
        is_private_note: isPrivate,
      })
      .select()
      .single();
    if (insErr) return jsonResponse({ ok: false, error: insErr.message }, { status: 500 });
    const message = inserted as { id: string };

    // Bump conversation timestamps for ordering.
    await admin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        // If a human starts typing, flip the status so the AI pauses.
        ...(isPrivate
          ? {}
          : { status: 'human_active', ai_paused: true, assigned_to: caller.userId }),
      })
      .eq('id', conversationId);

    if (isPrivate) {
      return jsonResponse({ ok: true, message_id: message.id, sent: false });
    }

    const convRow = conv as {
      contact_id: string;
      channel: 'whatsapp' | 'instagram' | null;
      channel_id?: string | null;
    };

    try {
      const { data: contactRow } = await admin
        .from('contacts')
        .select('phone')
        .eq('id', convRow.contact_id)
        .maybeSingle();
      const contact = (contactRow as { phone?: string } | null) ?? {};

      // webjs (Baileys) devolve null de propósito: o envio real acontece no
      // worker separado (polling), não aqui. A linha fica com
      // webjs_message_id NULL, o worker preenche quando enviar de verdade.
      await sendInboxWithResolve(
        admin,
        {
          conversationRowId: conversationId,
          orgId: caller.orgId,
          channel: 'whatsapp',
          phone: contact.phone ?? null,
          channelId: convRow.channel_id ?? null,
        },
        { text: content },
      );

      return jsonResponse({ ok: true, message_id: message.id, sent: false });
    } catch (err) {
      await admin.from('messages').update({ meta_status: 'failed' }).eq('id', message.id);
      return jsonResponse({
        ok: true,
        message_id: message.id,
        sent: false,
        error: err instanceof Error ? err.message : 'Erro ao enviar.',
      });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.message }, { status: err.status });
    }
    console.error('send-operator-message error', err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno' },
      { status: 500 },
    );
  }
});
