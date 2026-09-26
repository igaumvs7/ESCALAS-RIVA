-- Duas mudanças pedidas pelo dono (2026-09-05) na aba de Feedback:
--   1) "A pessoa só tem direito a fazer uma avaliação" — hoje não existia
--      nenhum limite (3 linhas de teste da mesma org confirmam). Remove os
--      duplicados de teste (mantém só o mais recente por org) e passa a
--      barrar no RPC.
--   2) "Essa aba só deveria ser liberada depois de 1 dia... e fica uma
--      notificação como se fosse do sistema pedindo a avaliação" — a aba
--      passa a exigir 24h de conta criada (checado no frontend via
--      organizations.created_at) e um job horário dispara a notificação de
--      convite assim que a org completa esse tempo (uma vez só, por isso o
--      marcador feedback_prompt_sent_at).
SET search_path TO whatsapp_hub, public;

-- 1) Dedupe (só existiam repetidos de teste da própria org do dono) + UNIQUE.
DELETE FROM whatsapp_hub.feedback_entries fe
WHERE fe.id NOT IN (
  SELECT DISTINCT ON (org_id) id
  FROM whatsapp_hub.feedback_entries
  ORDER BY org_id, created_at DESC
);

ALTER TABLE whatsapp_hub.feedback_entries
  ADD CONSTRAINT feedback_entries_org_id_key UNIQUE (org_id);

CREATE OR REPLACE FUNCTION whatsapp_hub.submit_feedback_rating(p_rating SMALLINT, p_comment TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'whatsapp_hub', 'pg_temp'
AS $$
DECLARE
  v_org_id UUID := whatsapp_hub.current_org_id();
  v_entry_id UUID;
  v_org_name TEXT;
  v_comment TEXT := NULLIF(btrim(COALESCE(p_comment, '')), '');
  v_admin RECORD;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Sessão sem organização.';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Nota precisa ser de 1 a 5.';
  END IF;

  IF EXISTS (SELECT 1 FROM whatsapp_hub.feedback_entries WHERE org_id = v_org_id) THEN
    RAISE EXCEPTION 'Você já enviou sua avaliação — só é possível avaliar uma vez.';
  END IF;

  INSERT INTO whatsapp_hub.feedback_entries (org_id, created_by, rating, comment)
  VALUES (v_org_id, auth.uid(), p_rating, v_comment)
  RETURNING id INTO v_entry_id;

  SELECT name INTO v_org_name FROM whatsapp_hub.organizations WHERE id = v_org_id;

  FOR v_admin IN
    SELECT id FROM auth.users WHERE (raw_app_meta_data->>'is_super_admin')::boolean IS TRUE
  LOOP
    INSERT INTO whatsapp_hub.notifications (user_id, org_id, type, title, body)
    VALUES (
      v_admin.id,
      v_org_id,
      'feedback'::whatsapp_hub.notification_type,
      'Nova avaliação de ' || COALESCE(v_org_name, 'um cliente') || ': ' || p_rating || '/5',
      COALESCE(v_comment, 'Sem comentário.')
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;

-- 2) Convite automático pra avaliar, disparado 24h depois da conta criada.
ALTER TABLE whatsapp_hub.organizations
  ADD COLUMN IF NOT EXISTS feedback_prompt_sent_at timestamptz;

CREATE OR REPLACE FUNCTION whatsapp_hub._send_feedback_unlock_prompts()
RETURNS void
LANGUAGE plpgsql
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_org RECORD;
  v_admin RECORD;
BEGIN
  FOR v_org IN
    SELECT id, name FROM whatsapp_hub.organizations
    WHERE status = 'active'
      AND feedback_prompt_sent_at IS NULL
      AND created_at <= now() - interval '24 hours'
      -- já avaliou antes dos 24h (não deveria dar, mas por segurança não
      -- manda convite pra quem já respondeu).
      AND id NOT IN (SELECT org_id FROM whatsapp_hub.feedback_entries)
  LOOP
    FOR v_admin IN
      SELECT user_id FROM whatsapp_hub.app_users
      WHERE org_id = v_org.id AND role = 'admin'
    LOOP
      INSERT INTO whatsapp_hub.notifications (user_id, org_id, type, title, body)
      VALUES (
        v_admin.user_id,
        v_org.id,
        'feedback'::whatsapp_hub.notification_type,
        'Sua opinião é importante pra gente',
        'Você já usa a VIVAS CONNECT há um tempo — dá pra deixar sua avaliação na aba Feedback, é rapidinho.'
      );
    END LOOP;

    UPDATE whatsapp_hub.organizations SET feedback_prompt_sent_at = now() WHERE id = v_org.id;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'wh-feedback-unlock-prompt',
  '20 * * * *',
  $$SELECT whatsapp_hub._send_feedback_unlock_prompts();$$
);
