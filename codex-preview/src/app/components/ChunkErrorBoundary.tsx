import { Component, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const RELOAD_FLAG_KEY = 'vivas_chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(error: Error) {
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror|loading chunk [\d]+ failed/i.test(
    error.message,
  );
}

// Bug real reportado pelo dono: trocar de aba às vezes cai numa tela em
// branco que só sai com F5. Causa: cada deploy novo (frequente neste
// projeto) muda o hash dos arquivos JS de cada página (lazy/code-split).
// Uma aba aberta de ANTES do deploy tenta buscar o chunk antigo, que não
// existe mais no servidor — o import() rejeita, e sem um Error Boundary
// isso derruba a árvore React inteira sem aviso (tela em branco). Aqui a
// gente detecta esse erro específico e recarrega sozinho uma vez (cooldown
// evita loop se o erro for outra coisa, tipo rede offline); se persistir,
// mostra um botão manual em vez de deixar a tela muda.
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return;
    const lastReload = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || 0);
    if (Date.now() - lastReload > RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="glass-card max-w-sm w-full p-6 text-center space-y-4">
            <img src="/logo-mark.png" alt="VIVAS" className="h-9 w-9 mx-auto object-contain" />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                O sistema foi atualizado.
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Recarregue a página pra continuar de onde parou.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[rgba(var(--accent-secondary-rgb),0.25)] bg-white/[0.03] px-4 text-sm font-medium text-[var(--color-text-primary)] transition-all duration-[0.4s] [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] hover:border-[var(--accent-secondary)] hover:shadow-[0_0_30px_rgba(var(--accent-secondary-rgb),0.25)] w-full"
            >
              <RotateCw className="h-4 w-4" />
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
