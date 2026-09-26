import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, Loader2, MessageSquareHeart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedbackEntries, submitFeedbackRating } from '@/hooks/useFeedback';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { FEEDBACK_UNLOCK_HOURS, isOrgOldEnough } from '@/app/layout/nav-config';

// ----------------------------------------------------------------------------
// FeedbackPage (/feedback) — pedido do dono (2026-08-29): "um botão chamado
// feedback que a pessoa possa enviar um feedback pra mim". Reescrito em
// 2026-09-01: era um mini-suporte (thread com resposta/status), virou
// avaliação de verdade — nota de 1 a 5 + comentário opcional, enviada uma
// vez, sem virar conversa. Mostra o histórico das PRÓPRIAS avaliações da
// org (RLS), só leitura.
//
// 2026-09-05: só 1 avaliação por org (barrado no RPC submit_feedback_rating
// também — aqui é só a UI refletindo isso) e a aba só é linkada na sidebar
// depois de FEEDBACK_UNLOCK_HOURS de conta — a checagem abaixo é rede de
// segurança pra quem digitar a URL direto antes disso.
// ----------------------------------------------------------------------------

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StarRow({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={size}
          fill={n <= value ? 'var(--accent-primary)' : 'none'}
          stroke="var(--accent-primary)"
        />
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const { entries, loading, reload } = useFeedbackEntries();
  const { userId, orgCreatedAt } = useAppUser();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const myEntries = entries.filter((e) => e.created_by === userId);
  const jaAvaliou = myEntries.length > 0;
  const desbloqueada = isOrgOldEnough(orgCreatedAt, FEEDBACK_UNLOCK_HOURS);

  const handleSubmit = async () => {
    if (!rating || sending) return;
    setSending(true);
    try {
      await submitFeedbackRating(rating, comment);
      setRating(0);
      setComment('');
      await reload();
      toast.success('Avaliação enviada. Obrigado!');
    } catch (err) {
      toast.error('Falha ao enviar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <MessageSquareHeart className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Feedback</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Avalie como está sendo usar o sistema — vai direto pra quem cuida dele.
          </p>
        </div>
      </div>

      {!desbloqueada ? (
        <Card className="p-6 flex items-start gap-3">
          <Clock className="h-5 w-5 text-[var(--color-text-secondary)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Ainda não disponível</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              A avaliação libera depois de {FEEDBACK_UNLOCK_HOURS}h de uso da conta — dá tempo de
              formar uma opinião de verdade sobre o sistema. Volta aqui daqui a pouco.
            </p>
          </div>
        </Card>
      ) : jaAvaliou ? (
        <Card className="p-6 text-center space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Você já enviou sua avaliação — só é possível avaliar uma vez. Obrigado pelo feedback!
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Ficou alguma dúvida ou quer falar mais alguma coisa? Chama direto no suporte:
          </p>
          <a
            href="https://wa.me/5585992620981?text=Ol%C3%A1!%20Sou%20cliente%20do%20VIVAS%20CONNECT%20e%20queria%20falar%20sobre..."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#062112] transition hover:brightness-105"
          >
            Falar no WhatsApp
          </a>
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div>
            <div className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Sua nota</div>
            <div
              className="flex items-center gap-1"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHoverRating(n)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} de 5 estrelas`}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className="h-8 w-8"
                    fill={n <= (hoverRating || rating) ? 'var(--accent-primary)' : 'none'}
                    stroke="var(--accent-primary)"
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="feedback-comment" className="text-sm font-semibold text-[var(--color-text-primary)] mb-2 block">
              Comentário (opcional)
            </label>
            <textarea
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="O que está funcionando bem, o que poderia melhorar..."
              disabled={sending}
              className="w-full rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleSubmit()} disabled={sending || !rating}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar avaliação'}
            </Button>
          </div>
        </Card>
      )}

      {(loading || myEntries.length > 0) && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[var(--color-text-secondary)]">Suas avaliações anteriores</div>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-secondary)]" />
            </div>
          ) : (
            <div className="space-y-2">
              {myEntries.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <StarRow value={e.rating} />
                    <span className="text-xs text-[var(--color-text-secondary)]">{relativeDate(e.created_at)}</span>
                  </div>
                  {e.comment && (
                    <p className="mt-2 text-sm text-[var(--color-text-primary)]">{e.comment}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
