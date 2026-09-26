-- Feedback deixa de ser um mini-suporte (thread com status/resposta) e vira
-- avaliação de verdade: nota de 1 a 5 + comentário opcional, enviada uma vez,
-- sem virar conversa. Pedido do dono: "a aba de feedback ela esta
-- funcionando como se fosse um suporte, eu nao queria dessa forma queria que
-- fosse uma parte de feedback mesmo" -- perguntado o formato, escolheu
-- "avaliação rápida + comentário" (dá pra ver média de satisfação ao longo
-- do tempo).
--
-- `feedback_threads`/`feedback_messages` (RPCs submit_feedback/reply_feedback/
-- set_feedback_status) NÃO são apagadas -- só paradas de usar na UI. Só
-- tinha 1 registro de teste até aqui, mas segue o padrão do projeto de nunca
-- apagar tabela com dado histórico (ver Funil/deals no CLAUDE.md) — só não
-- usar em feature nova.

CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE TABLE whatsapp_hub.feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_entries_org_id_idx ON whatsapp_hub.feedback_entries(org_id);
CREATE INDEX feedback_entries_created_at_idx ON whatsapp_hub.feedback_entries(created_at DESC);

ALTER TABLE whatsapp_hub.feedback_entries ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de feedback_threads: org enxerga só a própria, super admin
-- enxerga tudo (feedback é dirigido a ele, não é dado de domínio do tenant).
CREATE POLICY feedback_entries_select ON whatsapp_hub.feedback_entries
  FOR SELECT
  USING (
    (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active())
    OR whatsapp_hub.is_super_admin()
  );

CREATE POLICY feedback_entries_insert ON whatsapp_hub.feedback_entries
  FOR INSERT
  WITH CHECK (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND created_by = auth.uid()
  );

-- Só o super admin marca como lida (não existe "responder" nem outro status).
CREATE POLICY feedback_entries_update ON whatsapp_hub.feedback_entries
  FOR UPDATE
  USING (whatsapp_hub.is_super_admin())
  WITH CHECK (whatsapp_hub.is_super_admin());

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

CREATE OR REPLACE FUNCTION whatsapp_hub.mark_feedback_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'whatsapp_hub', 'pg_temp'
AS $$
BEGIN
  IF NOT whatsapp_hub.is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin marca avaliação como lida.';
  END IF;

  UPDATE whatsapp_hub.feedback_entries
     SET read_at = now()
   WHERE id = p_id
     AND read_at IS NULL;
END;
$$;
