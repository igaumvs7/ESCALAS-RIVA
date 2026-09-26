-- ============================================================================
-- 20260824160000_agent_site_cover_focus
-- ----------------------------------------------------------------------------
-- Pedido do dono: poder escolher como a foto de capa se enquadra no quadro
-- (em vez de sempre centralizar). Guarda só o foco vertical (0=topo,
-- 100=base) — vira `background-position-y` no card público
-- (AgentSitePreviewCard). Ajustado por um slider no editor, não drag livre:
-- drag pixel-a-pixel exigiria calcular overflow real da imagem escalada
-- (largura/altura natural vs. caixa) pra converter em %, frágil de acertar
-- sem ferramenta de preview visual neste ambiente. Slider é exato por
-- definição de CSS, sem esse cálculo.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.agent_sites
  ADD COLUMN IF NOT EXISTS cover_focus_y smallint NOT NULL DEFAULT 50
    CHECK (cover_focus_y BETWEEN 0 AND 100);
