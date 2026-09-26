-- ============================================================================
-- VIVAS · Configuração de disparo (modo seguro/arriscado/manual)
-- ----------------------------------------------------------------------------
-- Pedido do dono (2026-08-27): em vez de só aplicar sempre um limite fixo de
-- 150 msgs/dia, deixar o admin escolher entre um preset "seguro" (150/dia,
-- delays mais espaçados — os valores DEFAULTS originais do campaignWorker.js)
-- ou "arriscado" (250/dia, delays mais apertados pra caber mais volume no
-- mesmo horário comercial) — ou editar os delays na mão (modo manual).
-- campaignWorker.js passa a ler esses valores por org em vez dos DEFAULTS
-- fixos; sem linha nessa tabela (org que nunca mexeu), cai no preset seguro —
-- exatamente o comportamento de antes desta migração, ninguém é afetado sem
-- optar.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE TABLE whatsapp_hub.dispatch_settings (
  org_id                  UUID PRIMARY KEY REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  mode                    TEXT NOT NULL DEFAULT 'safe' CHECK (mode IN ('safe', 'risky', 'manual')),
  daily_limit             INT NOT NULL DEFAULT 150 CHECK (daily_limit BETWEEN 10 AND 300),
  delay_curto_min_seconds INT NOT NULL DEFAULT 35 CHECK (delay_curto_min_seconds >= 5),
  delay_curto_max_seconds INT NOT NULL DEFAULT 80 CHECK (delay_curto_max_seconds >= delay_curto_min_seconds),
  delay_medio_a_cada      INT NOT NULL DEFAULT 8 CHECK (delay_medio_a_cada >= 2),
  delay_medio_min_minutes NUMERIC NOT NULL DEFAULT 4 CHECK (delay_medio_min_minutes >= 0.5),
  delay_medio_max_minutes NUMERIC NOT NULL DEFAULT 9 CHECK (delay_medio_max_minutes >= delay_medio_min_minutes),
  delay_longo_a_cada      INT NOT NULL DEFAULT 30 CHECK (delay_longo_a_cada >= 5),
  delay_longo_min_minutes NUMERIC NOT NULL DEFAULT 20 CHECK (delay_longo_min_minutes >= 1),
  delay_longo_max_minutes NUMERIC NOT NULL DEFAULT 35 CHECK (delay_longo_max_minutes >= delay_longo_min_minutes),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dispatch_settings_updated_at
  BEFORE UPDATE ON whatsapp_hub.dispatch_settings
  FOR EACH ROW EXECUTE FUNCTION whatsapp_hub.set_updated_at();

ALTER TABLE whatsapp_hub.dispatch_settings ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da org (pra mostrar o modo atual na tela).
CREATE POLICY dispatch_settings_select ON whatsapp_hub.dispatch_settings
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

-- Escrita: só admin da própria org — diferente de webjs_sessions (que só o
-- worker/Edge Function escreve), aqui é uma preferência de uso que o próprio
-- admin ajusta direto na tela, sem precisar de Edge Function no meio.
CREATE POLICY dispatch_settings_admin_write ON whatsapp_hub.dispatch_settings
  FOR ALL TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active()
         AND whatsapp_hub.current_user_role() = 'admin')
  WITH CHECK (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active()
         AND whatsapp_hub.current_user_role() = 'admin');
