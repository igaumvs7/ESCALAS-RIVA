import { useNavigate } from 'react-router-dom';
import { MessageSquareHeart } from 'lucide-react';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { useFeedbackEntries } from '@/hooks/useFeedback';
import { FEEDBACK_UNLOCK_HOURS, isOrgOldEnough } from './nav-config';

// Pedido do dono (2026-09-09): a notificação de feedback (antes só um sino
// discreto) precisava ser "mais chamativa" e "não sair até ser feita a
// função" — banner fixo, sem botão de fechar de propósito, em vez de um
// toast/notificação que dá pra ignorar. Some sozinho assim que a pessoa
// envia a avaliação (useFeedbackEntries é realtime — ver useFeedback.ts) ou
// se a organização ainda não completou as FEEDBACK_UNLOCK_HOURS de conta.
export function FeedbackPromptBanner() {
  const navigate = useNavigate();
  const { userId, orgCreatedAt } = useAppUser();
  const { entries, loading } = useFeedbackEntries();

  const desbloqueada = isOrgOldEnough(orgCreatedAt, FEEDBACK_UNLOCK_HOURS);
  const jaAvaliou = entries.some((e) => e.created_by === userId);

  if (loading || !desbloqueada || jaAvaliou) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-[rgba(var(--accent-primary-rgb),0.14)] border-b border-[rgba(var(--accent-primary-rgb),0.4)] text-sm text-[var(--color-text-primary)]">
      <div className="flex items-center gap-2 min-w-0">
        <MessageSquareHeart className="h-4 w-4 shrink-0 text-[var(--accent-primary)] animate-pulse" />
        <span className="truncate">
          <strong className="font-semibold">Já faz um tempo que você usa o VIVAS CONNECT</strong> —
          conta pra gente como está sendo, leva menos de 1 minuto.
        </span>
      </div>
      <button
        type="button"
        onClick={() => navigate('/feedback')}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-bold text-[#0A0A0F] transition hover:brightness-110"
      >
        Avaliar agora
      </button>
    </div>
  );
}
