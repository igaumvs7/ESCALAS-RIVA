-- Aba de notificações vira 2 abas — pedido do dono: "quero que a aba de
-- notificações tenha 2 abas SISTEMA / PERFIL, que dai toda atualização do
-- sistema que eu fizer ou eu quiser escrever algo para mandar para todos...
-- a pessoa possa clicar e ler melhor... e a outra aba de perfil tudo aquilo
-- que ela recebe do perfil dela... eu quero que cada aba caso tenha
-- mensagem fique com o balãozinho de mensagem até a pessoa clicar".
--
-- PERFIL = a tabela `notifications` já existente (new_message/handoff/
-- feedback), sem mudança nenhuma de schema.
-- SISTEMA = comunicado GLOBAL (não é por org) que só o super admin escreve
-- e que TODO usuário autenticado, de qualquer organização, enxerga — bem
-- diferente do resto do sistema (que é sempre org-scoped). Rastreio de
-- "lido" é por usuário (`system_announcement_reads`), não por org.

CREATE SCHEMA IF NOT EXISTS whatsapp_hub;
SET search_path TO whatsapp_hub;

CREATE TABLE whatsapp_hub.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX system_announcements_created_at_idx ON whatsapp_hub.system_announcements(created_at DESC);

ALTER TABLE whatsapp_hub.system_announcements ENABLE ROW LEVEL SECURITY;

-- Todo usuário autenticado (qualquer org) lê todos os comunicados — é
-- global de propósito, não segue org_id/current_org_id() como o resto do
-- schema.
CREATE POLICY system_announcements_select ON whatsapp_hub.system_announcements
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY system_announcements_insert ON whatsapp_hub.system_announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (whatsapp_hub.is_super_admin() AND created_by = auth.uid());

CREATE POLICY system_announcements_delete ON whatsapp_hub.system_announcements
  FOR DELETE
  TO authenticated
  USING (whatsapp_hub.is_super_admin());

CREATE TABLE whatsapp_hub.system_announcement_reads (
  announcement_id UUID NOT NULL REFERENCES whatsapp_hub.system_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE whatsapp_hub.system_announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_announcement_reads_select ON whatsapp_hub.system_announcement_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY system_announcement_reads_insert ON whatsapp_hub.system_announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
