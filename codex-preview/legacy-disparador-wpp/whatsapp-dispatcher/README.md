# VIVAS ENVIA

Painel web para disparo de mensagens em massa no WhatsApp, com importação de
contatos via planilha Excel e um motor de envio de **3 níveis de delay**
pensado para **minimizar ao máximo o risco de bloqueio do número**.

## ⚠️ Leia antes de usar

Esta ferramenta usa a biblioteca [`whatsapp-web.js`](https://wwebjs.dev/), que
automatiza o **WhatsApp Web** por trás de um navegador (Puppeteer/Chromium).
É uma automação não-oficial: o WhatsApp/Meta não a endossa e, tecnicamente,
o uso de automação viola os Termos de Serviço do WhatsApp normal.

**Nenhuma ferramenta — esta ou qualquer outra "disparador em massa" que
existe no mercado — pode garantir 100% que o número nunca será bloqueado.**
Quem decide isso é o sistema de detecção do WhatsApp/Meta, que muda com o
tempo e não divulga suas regras exatas. O que este projeto faz é levar o
conjunto de boas práticas conhecidas ao limite prático, para **reduzir
drasticamente** o risco, evitando os erros clássicos que fazem os
disparadores genéricos tomarem banimento em poucas horas:

- ❌ Enviar em paralelo (várias mensagens ao mesmo tempo)
- ❌ Delay fixo e curto entre mensagens
- ❌ Mandar centenas de mensagens sem pausa
- ❌ Mandar para números que nunca ouviram falar do remetente
- ❌ Texto 100% idêntico para todo mundo
- ❌ Personalizar com um "nome" que na verdade é lixo de planilha (número, "N/A" etc.)

### Recomendações de uso responsável

1. **Use apenas com sua própria base de leads/clientes** — pessoas que já
   têm relação com a imobiliária/corretor (pediram contato, preencheram
   formulário, etc.). Nunca compre listas frias.
2. **Chip novo precisa de "aquecimento"**: comece com um limite diário baixo
   (ex.: 30–50 mensagens) na primeira semana e vá aumentando aos poucos.
   Use um número que já tenha conversas humanas normais no WhatsApp antes de
   colocá-lo para disparar em massa.
3. **Prefira o WhatsApp Business** (app oficial) para o número usado.
4. **Respeite quem pedir para parar** — se alguém responder "descadastrar",
   "parar", "não quero mais", remova da lista manualmente.
5. Se o volume for realmente grande (milhares de disparos/dia) e a operação
   for crítica, o caminho tecnicamente suportado pelo WhatsApp é a
   **WhatsApp Business Platform (Cloud API)**, oficial e paga — sem risco de
   bloqueio por automação, mas exige aprovação de templates de mensagem.

## Estudo dos tempos seguros: por que o motor tem 3 níveis de delay

O WhatsApp não publica os limites exatos que usa para marcar um número como
suspeito — isso muda com o tempo e varia conforme o histórico do próprio
número. Não existe uma tabela oficial de "X segundos = seguro". O que existe
é um consenso prático, observado por quem trabalha com automação de
WhatsApp há anos: **o que mais chama atenção não é um único delay curto,
é a ausência de variação**. Um robô que manda uma mensagem a cada exatos 10
segundos, ou que faz uma única pausa de lote sempre igual, ainda cria um
padrão identificável — só que numa escala diferente.

Por isso o VIVAS ENVIA usa **3 tipos de delay, cada um numa escala de
tempo diferente, todos com variação aleatória (jitter)**, para que o
comportamento de disparo se pareça mais com o de alguém que manda mensagem,
para, faz outra coisa, volta, manda mais um pouco, para de novo por mais
tempo (ex.: foi almoçar) — em vez de um metrônomo:

| Nível | O que imita | Frequência padrão | Duração padrão |
|---|---|---|---|
| **Tipo 1 — curto** | A pausa natural entre digitar uma mensagem e a próxima | Toda mensagem | 35–80 segundos |
| **Tipo 2 — médio** | Uma pequena interrupção (respondeu outra coisa, foi buscar um café) | A cada 8±2 mensagens | 4–9 minutos |
| **Tipo 3 — longo** | Uma parada real (reunião, almoço, fim do turno) | A cada 30±5 mensagens | 20–35 minutos |

Esses números são **heurísticas conservadoras baseadas em prática comum de
mercado**, não uma garantia matemática — e são exatamente por isso
configuráveis no painel. Regras gerais se você for ajustar:

- **Chip novo (primeira semana):** delays mais longos e limite diário baixo
  (30–50 msgs/dia). Prefira aumentar o delay tipo 3 em vez de diminuir o
  tipo 1 — pausas maiores protegem mais do que pausas curtas mais rápidas.
- **Chip já aquecido, com histórico de uso normal:** os padrões da tabela
  acima já são um ponto de partida razoável.
- **Nunca zere o delay tipo 1** (mínimo abaixo de ~20s) — é o que mais
  rapidamente cria um padrão de robô.
- O **limite diário** (padrão 150/dia) pode ser desativado no painel, mas
  isso remove uma das proteções mais importantes — só desative se você
  tiver um motivo específico e souber o risco que está assumindo.

Além dos delays, duas outras coisas reduzem o "fingerprint" de mensagem em
massa:

- **Rotação entre até 5 mensagens diferentes** (cadastradas no painel): o
  motor alterna entre elas a cada envio, em vez de repetir sempre o mesmo
  texto.
- **Variação de texto dentro da própria mensagem** via spintax
  (`{opção 1|opção 2}`), combinável com a rotação acima.

## Como o motor anti-bloqueio funciona (resumo completo)

Todos os valores abaixo são configuráveis pelo painel:

| Proteção | Padrão | Por quê |
|---|---|---|
| Envio sequencial (nunca paralelo) | sempre | paralelismo é o maior gatilho de ban |
| Delay tipo 1 (curto) | 35–80s a cada mensagem | evita padrão robótico de timer fixo |
| Delay tipo 2 (médio) | a cada ~8 msgs, 4–9 min | quebra o ritmo em uma escala intermediária |
| Delay tipo 3 (longo) | a cada ~30 msgs, 20–35 min | imita uma parada real (ex.: almoço) |
| Rotação de até 5 mensagens | ligado | evita repetir sempre o mesmo texto |
| Variação de texto (spintax) | opcional no template | variação também dentro de cada mensagem |
| Validação de nome do cliente | ligado (pode desativar) | não personaliza com nome inválido/lixo |
| Limite diário de mensagens | 150/dia (pode desativar) | evita picos de volume suspeitos |
| Janela de horário comercial | 08h–20h, seg–sáb | humano não manda mensagem de madrugada |
| Simulação de digitação | ligado (pode desativar) | mensagem não aparece "instantânea" |
| Validação do número antes de enviar | sempre | nunca tenta mandar pra número inexistente |
| Estado persistente e retomável | sempre | queda de energia/processo não reenvia quem já recebeu |
| Parada automática se desconectar | sempre | evita insistir enviando sem sessão ativa |

A explicação completa de "por que o WhatsApp bloqueia números e o que fazer
a respeito" também está disponível **dentro do próprio painel** (última
seção da página), para consulta rápida sem precisar abrir este arquivo.

## Requisitos

- Node.js 18 ou superior
- Google Chrome ou Chromium instalado (ou deixe o Puppeteer baixar o dele
  automaticamente na instalação)
- Um número de WhatsApp dedicado para os disparos (recomendado: não usar o
  seu WhatsApp pessoal principal)

## Instalação

```bash
cd whatsapp-dispatcher
npm install
cp .env.example .env
# edite o .env se quiser usuario/senha do painel e/ou apontar pra um
# Chrome ja instalado (CHROME_PATH)
npm start
```

Acesse `http://localhost:3333` (ou a porta configurada em `.env`).

## Passo a passo de uso

1. **Conectar o WhatsApp**: abra o painel, escaneie o QR code com o celular
   (WhatsApp → Aparelhos conectados → Conectar aparelho). A sessão fica
   salva em `.wwebjs_auth/` — não precisa escanear de novo a cada reinício.
2. **Importar contatos**: baixe a planilha modelo no próprio painel ou monte
   a sua com as colunas:
   - `Nome`
   - `WhatsApp` (aceita com ou sem DDI, com ou sem formatação)
   - `Empreendimento de Interesse` (opcional)

   O sistema aceita variações comuns de nome de coluna (`Telefone`,
   `Celular`, `Interesse`, `Imóvel`, etc.), valida cada número, remove
   duplicados e marca linhas inválidas para você corrigir.
3. **Cadastrar de 1 a 5 mensagens**: use `{{nome}}` e `{{empreendimento}}`
   para personalizar, e `{opção 1|opção 2}` para variar o texto dentro de
   cada mensagem. Com a rotação ativada, o motor alterna entre as variações
   cadastradas a cada envio.
4. **Nome do cliente**: com a validação automática ativada, o sistema só
   personaliza a mensagem com o nome se ele parecer um nome de pessoa de
   verdade (rejeita número, e-mail, "cliente", "N/A" etc.) — pode desativar
   essa checagem se preferir sempre usar o nome como veio da planilha.
5. **Ajustar os timers** (ou deixar os padrões já calibrados) e salvar.
6. **Iniciar a campanha**. Acompanhe em tempo real pelo log e pelos
   contadores (pendente/enviado/falhou/inválido). Pode pausar e retomar a
   qualquer momento — o motor sabe exatamente por onde parou.
7. Ao final (ou durante), baixe o **relatório** com o status de cada
   contato (enviado, falhou, inválido, se o nome foi usado, motivo do erro).

## Estrutura do projeto

```
whatsapp-dispatcher/
  server.js              # servidor Express + rotas da API
  src/
    config.js            # configuracoes padrao e caminhos
    store.js             # persistencia em JSON (contatos, settings, estado)
    logger.js            # log em memoria + arquivo, usado no painel
    phone.js             # normalizacao de numeros de telefone BR
    spintax.js           # placeholders {{nome}} e variacao {a|b}
    nameValidator.js      # heuristica para detectar nome de cliente invalido
    excelParser.js       # leitura e validacao da planilha
    whatsappClient.js    # integracao com whatsapp-web.js (QR, envio)
    campaignEngine.js    # motor anti-bloqueio (3 niveis de delay, rotacao, retomada)
  public/                # painel web (HTML/CSS/JS puro, sem build)
  data/                  # runtime: contatos, config, estado, logs, uploads (git-ignorado)
  test/run.js            # testes unitarios (node test/run.js)
```

## Rodando os testes

```bash
npm test
```

Cobre a normalização de telefone, a resolução de placeholders/spintax e a
validação de nome — a parte "pura" da lógica, sem depender de uma sessão
real do WhatsApp.

## Deploy

Este painel deve rodar em um servidor/VPS ligado continuamente (ex.: Node
com PM2, ou um serviço systemd), já que a campanha roda em segundo plano
enquanto o processo estiver de pé. Não é um projeto para "rodar uma vez e
fechar o terminal" — se o processo morrer, a campanha pausa e retoma do
ponto exato quando o processo voltar.
