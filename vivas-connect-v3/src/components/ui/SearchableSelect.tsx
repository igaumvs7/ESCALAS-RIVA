import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ----------------------------------------------------------------------------
// SearchableSelect — combobox com busca, no lugar do <select> nativo.
// ----------------------------------------------------------------------------
// O <select> nativo herda cor/fundo do SO em muitos navegadores (as opções
// abertas ficam brancas com texto claro em cima, ilegível no dark mode) — não
// dá pra consertar só com CSS. Esse componente renderiza a lista de opções
// nós mesmos, então o estilo é sempre o nosso.
// ----------------------------------------------------------------------------

interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-white/[0.03] px-4 py-2 text-sm text-left transition-colors',
          'focus:border-[var(--accent-primary)] focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <span className={value ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] opacity-60'}>
          {value || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--color-text-secondary)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-[var(--color-bg-primary)] shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 border-b border-[rgba(var(--accent-secondary-rgb),0.15)] px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] placeholder:opacity-60 focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 && (
              <li className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">Nada encontrado.</li>
            )}
            {filtered.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-2 text-left text-sm text-[var(--color-text-primary)] transition-colors hover:bg-white/[0.06]',
                    option === value && 'bg-[rgba(var(--accent-secondary-rgb),0.12)]',
                  )}
                >
                  {option}
                  {option === value && <Check className="h-4 w-4 text-[var(--accent-primary)]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
