# VIVAS CONNECT — proposta visual “Command Deck”

## Objetivo

Esta versão reorganiza a apresentação do VIVAS CONNECT para construir uma
identidade própria e mais adulta. A aplicação continua usando as mesmas rotas,
providers, hooks, ações, permissões, consultas e integrações da versão enviada.

## Direção visual

- Estrutura de central de operação, com navegação lateral modular e cabeçalho
  contextual para cada área.
- Superfícies mais sólidas e precisas, com menos dependência do glassmorphism
  comum em templates de SaaS.
- Recorte assimétrico recorrente nos cartões, botões, campos e controles.
- Uso dos temas existentes em todos os novos elementos por meio dos mesmos
  tokens `--accent-*`.
- Dashboard dividido em Base operacional, Movimento no período, Qualificação,
  Resultado e Leads por tag.
- Métricas numeradas para melhorar leitura, comparação e localização visual.
- Versão móvel com a mesma identidade e navegação preservada.

## Arquivos alterados

- `src/styles/globals.css`: novo sistema de superfícies, fundo, cartões,
  navegação, cabeçalho, formulários e dashboard.
- `src/app/layout/AppLayout.tsx`: estrutura da área de trabalho e moldura do
  conteúdo.
- `src/app/layout/Header.tsx`: cabeçalho contextual baseado na rota atual.
- `src/app/layout/Sidebar.tsx`: nova apresentação da navegação e do plano.
- `src/app/layout/MobileNav.tsx`: adaptação do mesmo sistema visual ao celular.
- `src/app/routes/dashboard/DashboardPage.tsx`: nova hierarquia e organização
  das métricas existentes.
- `src/components/ui/button.tsx`: botões alinhados à nova identidade.
- `src/components/ui/input.tsx`: campos alinhados à nova identidade.

## O que foi preservado

- Todas as rotas e regras de acesso.
- Dashboard e seus filtros de período.
- Abertura dos detalhes de segmentos.
- Atualização das métricas.
- Sidebar recolhível e sua preferência salva no navegador.
- Navegação móvel.
- Status do Vivas Envia, notificações, ajuda, usuário e troca de organização.
- Temas e preferência de tema.
- CRM, contatos, inbox, campanhas, templates, Vivas Envia, Vivas Perfil,
  agente de IA, configurações, feedback, administração e ferramentas.
- Supabase, Edge Functions, migrations, worker do WhatsApp e APIs.

## Validação realizada

- Build original antes da alteração: aprovado.
- `npm run build` depois da alteração: aprovado.
- TypeScript: aprovado pelo `tsc -b` executado dentro do build.
- Vite: 3.691 módulos transformados e pacote de produção gerado.
- Comparação com o arquivo original: mudanças de produto restritas aos oito
  arquivos visuais listados acima, além desta documentação e do registro no
  `STATUS.md`.

## Como analisar localmente

1. Execute `npm ci`.
2. Configure as mesmas variáveis de ambiente usadas na versão atual.
3. Execute `npm run dev`.
4. Confira primeiro Dashboard, Inbox, Vivas Envia, Contatos, Agente de IA,
   Configurações e a navegação em celular.

Esta entrega é uma cópia de avaliação. O arquivo original enviado permanece
disponível e não foi sobrescrito.
