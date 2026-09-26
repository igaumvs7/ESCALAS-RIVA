-- ============================================================================
-- VIVAS · Cadastro passa a capturar o WhatsApp de contato (pedido do dono:
-- vira a "lista de contatos dos clientes" no painel /admin).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE OR REPLACE FUNCTION whatsapp_hub.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, public, pg_temp
AS $$
DECLARE
  v_user_count INT;
  v_role       whatsapp_hub.tenant_role;
  v_org        UUID;
  v_super      BOOLEAN := false;
  v_new_org    BOOLEAN := false;
  v_slug       TEXT;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM whatsapp_hub.app_users;

  IF v_user_count = 0 THEN
    v_role  := 'admin';
    v_super := true;
    SELECT id INTO v_org FROM whatsapp_hub.organizations
     WHERE status = 'active' ORDER BY created_at LIMIT 1;
    IF v_org IS NULL THEN
      INSERT INTO whatsapp_hub.organizations (name, slug)
      VALUES ('Organização Principal', 'principal')
      RETURNING id INTO v_org;
    END IF;

  ELSIF NEW.raw_user_meta_data ? 'invited_role'
        AND (NEW.raw_user_meta_data->>'invited_role') IN ('admin', 'operator')
        AND NULLIF(NEW.raw_user_meta_data->>'invited_org_id', '') IS NOT NULL THEN
    v_role := (NEW.raw_user_meta_data->>'invited_role')::whatsapp_hub.tenant_role;
    v_org  := (NEW.raw_user_meta_data->>'invited_org_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM whatsapp_hub.organizations
       WHERE id = v_org AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Organização do convite inexistente ou arquivada.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  ELSIF (NEW.raw_user_meta_data->>'signup_new_org') = 'true'
        AND NULLIF(NEW.raw_user_meta_data->>'org_name', '') IS NOT NULL THEN
    v_role    := 'admin';
    v_super   := false;
    v_new_org := true;
    INSERT INTO whatsapp_hub.organizations (name, slug, whatsapp_contact)
    VALUES (
      NEW.raw_user_meta_data->>'org_name',
      whatsapp_hub._unique_org_slug(NEW.raw_user_meta_data->>'org_name'),
      NULLIF(NEW.raw_user_meta_data->>'whatsapp', '')
    )
    RETURNING id INTO v_org;

  ELSE
    RAISE EXCEPTION 'Self-signup desabilitado. Solicite um convite ao administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO whatsapp_hub.app_users (user_id, org_id, role, is_super_admin, accepted_at)
  VALUES (NEW.id, v_org, v_role, v_super, now())
  ON CONFLICT (user_id) DO NOTHING;

  IF v_new_org THEN
    INSERT INTO whatsapp_hub.subscriptions (org_id, status, plan_price_cents)
    VALUES (v_org, 'pending_first_payment', 5999);

    -- Semeia o VIVAS Perfil com o que já foi coletado no cadastro (nome,
    -- segmento, CRECI) — o corretor edita o resto depois em Configurações,
    -- mas não começa do zero. Slug reaproveita o mesmo gerado pra org.
    SELECT slug INTO v_slug FROM whatsapp_hub.organizations WHERE id = v_org;
    INSERT INTO whatsapp_hub.agent_sites (org_id, slug, display_name, segmento, creci, is_published)
    VALUES (
      v_org,
      v_slug,
      NEW.raw_user_meta_data->>'org_name',
      NULLIF(NEW.raw_user_meta_data->>'segmento', ''),
      NULLIF(NEW.raw_user_meta_data->>'creci', ''),
      false
    );
  END IF;

  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object(
                                'role',           v_role::text,
                                'org_id',         v_org::text,
                                'home_org_id',    v_org::text,
                                'is_super_admin', v_super
                              )
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.handle_new_user() FROM PUBLIC, authenticated, anon;
