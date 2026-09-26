-- ============================================================================
-- VIVAS · Canal webjs (disparador grátis, automação não-oficial)
-- ----------------------------------------------------------------------------
-- · channels ganha o provider 'webjs' — sem accountId/server_url exigido,
--   só telefone (preenchido quando a sessão conecta pela primeira vez).
-- · whatsapp_hub.webjs_sessions: 1 linha por org que ativou o canal. A
--   existência da linha É o sinal pro worker (processo separado, roda num
--   VPS, fora da Vercel) manter uma sessão whatsapp-web.js viva pra essa org.
--   status: disconnected -> qr -> authenticated -> ready.
-- · Escrita normal (status/qr/phone) é só do worker (service role). O admin
--   da org só pode inserir a linha (ativar) ou apagar (desativar) — feito via
--   Edge Functions webjs-activate/webjs-deactivate, não direto na tabela.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.channels
  DROP CONSTRAINT channels_provider_shape,
  DROP CONSTRAINT channels_provider_check;

ALTER TABLE whatsapp_hub.channels
  ADD CONSTRAINT channels_provider_check CHECK (provider IN ('zernio', 'uazapi', 'webjs'));

ALTER TABLE whatsapp_hub.channels
  ADD CONSTRAINT channels_provider_shape CHECK (
    (provider = 'zernio' AND zernio_account_id IS NOT NULL)
    OR
    (provider = 'uazapi' AND uazapi_server_url IS NOT NULL)
    OR
    (provider = 'webjs')
  );

CREATE TABLE whatsapp_hub.webjs_sessions (
  org_id        UUID PRIMARY KEY REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('disconnected', 'qr', 'authenticated', 'ready')),
  qr_data_url   TEXT,
  phone         TEXT,
  last_error    TEXT,
  connected_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_webjs_sessions_updated_at
  BEFORE UPDATE ON whatsapp_hub.webjs_sessions
  FOR EACH ROW EXECUTE FUNCTION whatsapp_hub.set_updated_at();

ALTER TABLE whatsapp_hub.webjs_sessions ENABLE ROW LEVEL SECURITY;

-- Leitura: membro da própria org (pra ver status/QR na tela de Canais).
CREATE POLICY webjs_sessions_select ON whatsapp_hub.webjs_sessions
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

-- Sem policy de INSERT/UPDATE/DELETE pra authenticated: ativar/desativar
-- passa pelas Edge Functions webjs-activate/webjs-deactivate (service role),
-- e o worker escreve status/qr também via service role.
GRANT SELECT ON whatsapp_hub.webjs_sessions TO authenticated;
