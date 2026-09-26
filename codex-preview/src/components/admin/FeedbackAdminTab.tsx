import { useMemo, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFeedbackEntries, markFeedbackRead } from '@/hooks/useFeedback';

// ----------------------------------------------------------------------------
// FeedbackAdminTab — aba "Feedback" dentro de /admin (só super admin, RLS já
// devolve as avaliações de TODAS as orgs pra ele). Reescrito em 2026-09-01:
// era um mini-suporte (thread com resposta/status), virou lista de
// avaliações (nota 1-5 + comentário) com média geral no topo — pedido do
// dono: "queria que fosse uma parte de feedback mesmo", formato escolhido
// foi "avaliação rápida + comentário".
// ----------------------------------------------------------------------------

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StarRow({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={size} fill={n <= value ? 'var(--accent-primary)' : 'none'} stroke="var(--accent-primary)" />
      ))}
    </div>
  );
}

type RatingFilter = number | 'todos' | 'nao_lidas';

export function FeedbackAdminTab() {
  const { entries, loading, reload } = useFeedbackEntries();
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('todos');
  const [search, setSearch] = useState('');

  const average = useMemo(() => {
    if (entries.length === 0) return 0;
    return entries.reduce((sum, e) => sum + e.rating, 0) / entries.length;
  }, [entries]);

  const unreadCount = useMemo(() => entries.filter((e) => !e.read_at).length, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (ratingFilter === 'nao_lidas' && e.read_at) return false;
      if (typeof ratingFilter === 'number' && e.rating !== ratingFilter) return false;
      if (!q) return true;
      return (
        (e.organizations?.name ?? '').toLowerCase().includes(q) ||
        (e.comment ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, ratingFilter, search]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-label">Média geral</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-extrabold text-[var(--color-text-primary)]">{average.toFixed(1)}</span>
            <StarRow value={Math.round(average)} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-label">Total de avaliações</div>
          <div className="mt-1 text-2xl font-extrabold text-[var(--color-text-primary)]">{entries.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-label">Não lidas</div>
          <div className="mt-1 text-2xl font-extrabold text-[var(--color-text-primary)]">{unreadCount}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRatingFilter('todos')}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border',
            ratingFilter === 'todos'
              ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)] bg-[rgba(var(--accent-secondary-rgb),0.1)]'
              : 'border-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setRatingFilter('nao_lidas')}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border',
            ratingFilter === 'nao_lidas'
              ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)] bg-[rgba(var(--accent-secondary-rgb),0.1)]'
              : 'border-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          )}
        >
          Não lidas {unreadCount > 0 && `(${unreadCount})`}
        </button>
        {[5, 4, 3, 2, 1].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRatingFilter(n)}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border',
              ratingFilter === n
                ? 'border-[var(--accent-primary)] text-[var(--color-text-primary)] bg-[rgba(var(--accent-secondary-rgb),0.1)]'
                : 'border-[rgba(var(--accent-secondary-rgb),0.15)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {n} <Star className="h-3 w-3" fill="currentColor" />
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por organização ou comentário..."
          className="ml-auto h-9 min-w-[220px] rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-secondary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-[var(--color-text-secondary)] opacity-70">
          Nenhuma avaliação com esse filtro.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Card key={e.id} className={cn('p-4', !e.read_at && 'border-[rgba(var(--accent-primary-rgb),0.4)]')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {e.organizations?.name ?? 'Organização'}
                    </span>
                    {!e.read_at && (
                      <span className="rounded-full bg-[rgba(var(--accent-primary-rgb),0.15)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-primary)]">
                        Nova
                      </span>
                    )}
                  </div>
                  <StarRow value={e.rating} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-secondary)]">{relativeDate(e.created_at)}</span>
                  {!e.read_at && (
                    <Button size="sm" variant="outline" onClick={() => void markFeedbackRead(e.id).then(reload)}>
                      Marcar como lida
                    </Button>
                  )}
                </div>
              </div>
              {e.comment && <p className="mt-2 text-sm text-[var(--color-text-primary)]">{e.comment}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
