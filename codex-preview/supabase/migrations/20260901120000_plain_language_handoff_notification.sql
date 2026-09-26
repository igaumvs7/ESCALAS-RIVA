-- Notificação de handoff ainda usava o jargão "Handoff para humano" no
-- título — passou batido nas rodadas anteriores que trocaram esse termo em
-- todo texto voltado pro cliente (Planos, Configurações > Equipe), porque
-- esse texto especificamente vem de um trigger SQL, não de componente React
-- (dono reportou com print: "ja removemos esse assunto handoff"). Mesma
-- lógica do _on_handoff_notify original (20260810120002), só o texto muda.

CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE OR REPLACE FUNCTION whatsapp_hub._on_handoff_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, public, pg_temp
AS $$
DECLARE
  contact_name TEXT;
  contact_phone TEXT;
  title_txt TEXT;
  body_txt TEXT;
BEGIN
  IF COALESCE(OLD.ai_paused, false) = true
     OR COALESCE(NEW.ai_paused, false) = false
  THEN
    RETURN NEW;
  END IF;

  SELECT c.name, c.phone
    INTO contact_name, contact_phone
    FROM whatsapp_hub.contacts c
   WHERE c.id = NEW.contact_id;

  title_txt := 'Conversa transferida pra você: ' || COALESCE(NULLIF(contact_name, ''), contact_phone, 'contato');
  body_txt  := 'A IA pausou e passou essa conversa pra você atender.';

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO whatsapp_hub.notifications (
      org_id, user_id, type, conversation_id, message_id, title, body
    )
    VALUES (
      NEW.org_id, NEW.assigned_to, 'handoff'::whatsapp_hub.notification_type,
      NEW.id, NULL, title_txt, body_txt
    );
  ELSE
    PERFORM whatsapp_hub._fanout_notification(
      NEW.org_id,
      'handoff'::whatsapp_hub.notification_type,
      NEW.id,
      NULL,
      title_txt,
      body_txt
    );
  END IF;

  RETURN NEW;
END;
$$;
