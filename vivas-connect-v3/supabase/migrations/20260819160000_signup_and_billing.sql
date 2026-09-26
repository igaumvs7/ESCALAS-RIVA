-- ============================================================================
-- VIVAS · Cadastro público (org nova por corretor) + billing PIX manual
-- ----------------------------------------------------------------------------
-- · handle_new_user ganha um 3º caso: signup self-serve com
--   `signup_new_org=true` + `org_name` na metadata cria uma ORGANIZAÇÃO NOVA
--   (o corretor vira admin dela, nunca super_admin). Sem isso, hoje só dava
--   pra entrar via convite numa org já existente — não servia pro modelo
--   "corretor se cadastra sozinho e ganha a própria conta".
-- · Toda org criada por esse caminho já nasce com uma linha em `subscriptions`
--   (status pending_first_payment) — é o que o guard de acesso do frontend
--   usa pra bloquear até o primeiro PIX cair. Orgs criadas pelo bootstrap ou
--   por convite direto do super-admin NÃO ganham linha automaticamente (não
--   ficam presas ao billing por padrão — evita o próprio dono se trancar
--   fora da própria plataforma).
-- · subscription_payments é o ledger (auditoria de pagamentos, idempotente
--   por mp_payment_id).
-- · process_subscription_lifecycle roda 1x/dia via pg_cron: active vencido
--   vira grace_period (+2 dias úteis), grace_period vencido vira blocked.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

-- ----------------------------------------------------------------------------
-- 1. Slug único de organização (usado pelo signup self-serve).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION whatsapp_hub._unique_org_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix TEXT;
BEGIN
  v_base := lower(regexp_replace(coalesce(p_name, 'corretor'), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'corretor'; END IF;
  v_base := left(v_base, 40);

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM whatsapp_hub.organizations WHERE slug = v_candidate) LOOP
    v_suffix := substr(md5(random()::text), 1, 5);
    v_candidate := v_base || '-' || v_suffix;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. subscriptions + subscription_payments.
-- ----------------------------------------------------------------------------

CREATE TABLE whatsapp_hub.subscriptions (
  org_id                  UUID PRIMARY KEY REFERENCES whatsapp_hub.organizations(id),
  status                  TEXT NOT NULL DEFAULT 'pending_first_payment'
                           CHECK (status IN ('pending_first_payment','active','grace_period','blocked','canceled')),
  plan_price_cents        INT NOT NULL DEFAULT 5999,
  current_period_end      TIMESTAMPTZ,
  grace_period_end        TIMESTAMPTZ,
  pending_payment_id      TEXT,
  pending_qr_base64       TEXT,
  pending_pix_copy_paste  TEXT,
  pending_created_at      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON whatsapp_hub.subscriptions
  FOR EACH ROW EXECUTE FUNCTION whatsapp_hub.set_updated_at();

ALTER TABLE whatsapp_hub.subscriptions ENABLE ROW LEVEL SECURITY;

-- Leitura: membro da própria org (banner de aviso) ou super admin. Escrita
-- só via service role (Edge Functions de pagamento/cron) — nenhum humano,
-- nem admin da própria org, edita status/valor por conta própria.
CREATE POLICY subscriptions_select ON whatsapp_hub.subscriptions
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() OR whatsapp_hub.is_super_admin());

CREATE TABLE whatsapp_hub.subscription_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES whatsapp_hub.organizations(id),
  mp_payment_id  TEXT NOT NULL UNIQUE,
  amount_cents   INT NOT NULL,
  status         TEXT NOT NULL,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_hub.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_payments_select ON whatsapp_hub.subscription_payments
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() OR whatsapp_hub.is_super_admin());

-- ----------------------------------------------------------------------------
-- 3. Ciclo de vida da assinatura: +2 dias ÚTEIS de carência após vencer.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION whatsapp_hub._add_business_days(p_start TIMESTAMPTZ, p_days INT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result TIMESTAMPTZ := p_start;
  v_added INT := 0;
BEGIN
  WHILE v_added < p_days LOOP
    v_result := v_result + INTERVAL '1 day';
    IF EXTRACT(ISODOW FROM v_result) < 6 THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION whatsapp_hub.process_subscription_lifecycle()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub, pg_temp
AS $$
DECLARE
  v_count INT := 0;
  v_total INT := 0;
BEGIN
  UPDATE whatsapp_hub.subscriptions
     SET status = 'grace_period',
         grace_period_end = whatsapp_hub._add_business_days(current_period_end, 2)
   WHERE status = 'active' AND current_period_end < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  UPDATE whatsapp_hub.subscriptions
     SET status = 'blocked'
   WHERE status = 'grace_period' AND grace_period_end < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.process_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION whatsapp_hub.process_subscription_lifecycle() TO service_role;

SELECT cron.schedule(
  'subscription-lifecycle',
  '17 3 * * *',
  $$SELECT whatsapp_hub.process_subscription_lifecycle();$$
);

-- ----------------------------------------------------------------------------
-- 4. handle_new_user — novo caso: signup self-serve cria organização nova.
--    Mantém os dois casos existentes (bootstrap e convite) intactos.
-- ----------------------------------------------------------------------------

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
    -- Corretor novo se cadastrando sozinho: org nova, ele é admin (nunca
    -- super_admin) dela, e a org já nasce travada até o primeiro PIX.
    v_role    := 'admin';
    v_super   := false;
    v_new_org := true;
    INSERT INTO whatsapp_hub.organizations (name, slug)
    VALUES (
      NEW.raw_user_meta_data->>'org_name',
      whatsapp_hub._unique_org_slug(NEW.raw_user_meta_data->>'org_name')
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

-- ----------------------------------------------------------------------------
-- 5. Fix: acento (ã, ç, é...) quebrava a palavra no meio em vez de virar
--    letra sem acento ("João" -> "jo-o" em vez de "joao"). translate() cobre
--    o alfabeto acentuado comum em nomes PT-BR sem depender da extensão
--    unaccent.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION whatsapp_hub._unique_org_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix TEXT;
BEGIN
  v_base := translate(
    coalesce(p_name, 'corretor'),
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIooooooOOOOOOuuuuUUUUcCnN'
  );
  v_base := lower(regexp_replace(v_base, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'corretor'; END IF;
  v_base := left(v_base, 40);

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM whatsapp_hub.organizations WHERE slug = v_candidate) LOOP
    v_suffix := substr(md5(random()::text), 1, 5);
    v_candidate := v_base || '-' || v_suffix;
  END LOOP;

  RETURN v_candidate;
END;
$$;
