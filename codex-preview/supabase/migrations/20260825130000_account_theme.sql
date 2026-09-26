-- ============================================================================
-- VIVAS · Tema (paleta de cores) passa a ser preferência DA CONTA, não do
-- navegador. Pedido do dono: "independente de onde seja ou qual computador
-- seja, tem que ficar tudo salvo". Antes era só localStorage (ThemeProvider.tsx)
-- — login num navegador/computador diferente sempre caía no tema padrão.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.app_users
  ADD COLUMN IF NOT EXISTS theme TEXT;

COMMENT ON COLUMN whatsapp_hub.app_users.theme IS
  'Paleta de cores escolhida pelo usuário (ver ThemeId em src/app/providers/ThemeProvider.tsx). NULL = nunca escolheu, usa o padrão local (localStorage) até logar em outro lugar.';
