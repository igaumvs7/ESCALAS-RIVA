# Ativar o banco permanente das escalas

O sistema já contém os botões de Histórico. Esta configuração é feita uma vez para permitir que o navegador envie o PDF e os dados JSON ao Google Drive e registre os links no Google Sheets.

1. Abra a planilha [BANCO DE ESCALAS](https://docs.google.com/spreadsheets/d/12jTIthOgHc1GI7D6DdkyD_kqhtDC7-aaR12Pgn9_F40/edit).
2. Clique em **Extensões → Apps Script**.
3. No arquivo **Code.gs**, apague o conteúdo inicial e cole todo o conteúdo de [Code.gs](./Code.gs).
4. Clique em **Salvar**.
5. Clique em **Implantar → Nova implantação**.
6. Em “Selecionar tipo”, escolha **Aplicativo da Web**.
7. Em “Executar como”, escolha **Eu**.
8. Em “Quem pode acessar”, escolha a opção que inclua todas as pessoas que usarão o sistema. Para uso fora de uma única empresa Google Workspace, normalmente será **Qualquer pessoa**.
9. Clique em **Implantar**, autorize o acesso à planilha e ao Drive e copie o endereço terminado em **/exec**.
10. No sistema, abra **Histórico → Configurar banco** e cole esse endereço.

Depois disso, o botão **Enviar ao banco** criará ou atualizará:

- o PDF com o nome escolhido;
- o arquivo JSON com os dados editáveis;
- a linha correspondente na aba **BANCO GERAL**;
- os links clicáveis nas abas mensais.

Não compartilhe o endereço do Aplicativo da Web fora da equipe. Ele dá acesso apenas à função de registrar escalas na pasta e na planilha configuradas no código.
