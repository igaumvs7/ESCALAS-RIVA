# Disparador-WPP (histórico)

Motor original do **VIVAS ENVIA** (v1), desenvolvido do zero por Igor Vivas
antes da migração multi-tenant. Repositório separado (`igaumvs7/Disparador-WPP`)
arquivado no GitHub — este código foi trazido pra cá só como referência
histórica, não é mais executado nem mantido separadamente.

O motor anti-bloqueio (3 níveis de delay, rotação de mensagens, spintax,
validação de nome, limite diário, janela comercial) foi portado para
`webjs-worker/` na raiz deste repositório, que é a versão ativa: multi-tenant,
integrada ao Supabase (em vez de arquivos JSON locais) e usando Baileys em vez
de `whatsapp-web.js`/Puppeteer.

Não rodar este código em produção — use `webjs-worker/`.
