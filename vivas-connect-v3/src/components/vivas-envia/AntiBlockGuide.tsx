import { Shield, Lock, ShieldAlert, Sparkles, ServerCog, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

// ----------------------------------------------------------------------------
// AntiBlockGuide — pedido do dono (2026-09-04): esconder os detalhes técnicos
// do motor anti-bloqueio (delays exatos em 3 camadas, aquecimento automático,
// proteção por taxa de resposta, simulação de digitação, spintax, score de
// risco) e mostrar só uma mensagem clara e confiante: sistema proprietário,
// desenvolvido do zero pelo VIVAS, exclusivo — secreto por natureza, mas 100%
// funcional. Substitui a versão anterior, que detalhava cada proteção card
// por card com números reais do motor (campaignWorker.js + baileys-antiban).
//
// A tabela de recuperação por bloqueio (abaixo) é EXCEÇÃO de propósito: não é
// mecanismo de envio, é consequência/status pra quem usa — o dono pediu
// explicitamente que ficasse visível (2026-09-05: "eu quero que ela apareça
// para o cliente"), depois de refazer os números (ver migração
// 20260905120000_webjs_recovery_rebalance.sql — os anteriores, 5/8/14 dias e
// 40/25/15 msgs/dia, eram exagerados pra experiência real relatada).
// ----------------------------------------------------------------------------

export function AntiBlockGuide() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-4">
          <header className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl glass-card flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h3 className="text-base font-bold">Sistema Anti-Bloqueio VIVAS</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Tecnologia própria, desenvolvida do zero — não existe no mercado.
              </p>
            </div>
          </header>

          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Todo disparo que sai da sua conta passa, automaticamente, por um sistema de proteção
            criado e mantido pelo próprio VIVAS — não é uma solução genérica que qualquer
            concorrente também usa. Foi pensado do zero, especificamente pra proteger o seu número.
          </p>

          <div className="flex items-start gap-2.5 rounded-lg border border-[rgba(var(--accent-primary-rgb),0.25)] bg-[rgba(var(--accent-primary-rgb),0.06)] px-4 py-3">
            <Lock className="h-4 w-4 text-[var(--accent-primary)] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-text-primary)]">
                Por isso não detalhamos como ele funciona por dentro.
              </strong>{' '}
              É tecnologia exclusiva do VIVAS, e parte do que protege o seu número é justamente
              ninguém de fora saber exatamente como o envio é feito. Você não precisa entender os
              detalhes técnicos — só precisa saber que está ativo, sempre, em toda mensagem, sem
              precisar configurar nada.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <header className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-[var(--accent-primary)]" />
            <h3 className="text-sm font-bold">O que você precisa saber</h3>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <TrustItem
              icon={ServerCog}
              title="Roda 24h num servidor próprio"
              body="Não depende do seu navegador aberto nem do computador ligado — o disparo continua rodando, monitorado, mesmo com tudo desligado do seu lado."
            />
            <TrustItem
              icon={ShieldAlert}
              title="Detecta risco e se protege sozinho"
              body="Se o sistema perceber qualquer sinal de risco, ele ajusta o ritmo ou pausa sozinho — antes de virar um bloqueio de verdade."
            />
            <TrustItem
              icon={Shield}
              title="Recuperação automática se bloquear"
              body="Se mesmo assim bloquear, existe um processo de recuperação que roda sozinho, sem você precisar mexer em nada — o número volta a operar normalmente com o tempo."
            />
            <TrustItem
              icon={CheckCircle2}
              title="Você escolhe o volume, a gente cuida do resto"
              body="Escolha o ritmo (seguro, moderado ou arriscado) na aba do disparador — toda a proteção por trás continua ativa em qualquer nível escolhido."
            />
          </div>
        </div>
      </Card>

      <RecoveryNote />
      <WarmupGuide />
    </div>
  );
}

function RecoveryNote() {
  return (
    <Card>
      <div className="space-y-3">
        <header className="flex items-center gap-2.5">
          <ShieldAlert className="h-4 w-4 text-[var(--accent-primary)]" />
          <div>
            <h3 className="text-sm font-bold">Se o número for bloqueado</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Recalculado em 2026-09-05 pra refletir a experiência real de uso — bem menos
              punitivo que antes.
            </p>
          </div>
        </header>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Não force reenvio nem tente contornar o bloqueio por conta própria — isso piora a
          situação, não ajuda. O sistema detecta sozinho e pausa os envios por 24h; depois disso,
          reconecta automaticamente com um limite diário reduzido por alguns dias, até reconstruir
          a confiança do número. Você acompanha tudo em tempo real na tela de conexão, sem
          precisar fazer nada manualmente.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <RecoveryTier ordinal="1º bloqueio" days="2 dias" limit="120 mensagens/dia" />
          <RecoveryTier ordinal="2º seguido" days="3 dias" limit="80 mensagens/dia" />
          <RecoveryTier ordinal="3º ou mais seguido" days="5 dias" limit="50 mensagens/dia" />
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed opacity-80">
          "Seguido" = bloqueou de novo em menos de 21 dias desde a última recuperação. Passado
          esse prazo sem novo bloqueio, a contagem zera e o próximo bloqueio (se houver) volta a
          ser tratado como o 1º — o histórico antigo não pesa pra sempre.
        </p>
      </div>
    </Card>
  );
}

function RecoveryTier({ ordinal, days, limit }: { ordinal: string; days: string; limit: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-error)]/25 bg-[var(--color-error)]/5 px-3.5 py-3 text-center">
      <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">{ordinal}</p>
      <p className="text-base font-bold mt-1">{days}</p>
      <p className="text-xs text-[var(--color-text-secondary)]">{limit}</p>
    </div>
  );
}

function WarmupGuide() {
  return (
    <Card>
      <div className="space-y-3">
        <header className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-[var(--accent-primary)]" />
          <div>
            <h3 className="text-sm font-bold">Como aquecer um chip novo antes de disparar em massa</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              O sistema já ajuda com isso automaticamente — este guia é um reforço manual pra
              coisas que só você controla.
            </p>
          </div>
        </header>
        <ol className="space-y-2.5 text-sm text-[var(--color-text-secondary)] list-decimal list-inside">
          <li>
            <strong className="text-[var(--color-text-primary)]">Antes de qualquer disparo:</strong> use
            o número normalmente por alguns dias — receba e faça ligações, converse individualmente com
            contatos reais, coloque foto de perfil e nome. Chip sem foto, sem histórico e recém-ativado
            é o perfil que mais chama atenção do WhatsApp.
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">Primeira semana:</strong> comece com
            campanhas pequenas, mesmo já estando no modo seguro. Prefira contatos que já salvaram esse
            número na agenda deles — reduz a chance de denúncia como spam.
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">Sinais de que o chip está no limite:</strong>{' '}
            bloqueios repetidos mesmo com poucos dias entre um e outro, ou bloqueio logo após voltar da
            recuperação. Nesse caso, considere aquecer um número reserva em paralelo em vez de insistir
            no mesmo chip.
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">Linha (SIM) muito nova:</strong> chip
            comprado há poucos dias, sem uso de voz/dados normal, tende a ser mais visado — quando der,
            prefira número que já tem alguma "história" na operadora.
          </li>
        </ol>
      </div>
    </Card>
  );
}

function TrustItem({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.04)] px-3.5 py-3">
      <Icon className="h-4 w-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{body}</p>
      </div>
    </div>
  );
}
