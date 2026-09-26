import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Depois de um deploy novo, os arquivos JS de cada página mudam de hash.
// Uma aba aberta de antes do deploy que tenta pré-carregar um chunk (Vite
// modulepreload) que não existe mais dispara esse evento em vez de um erro
// de render normal — sem isso, a troca de aba trava numa tela em branco até
// o usuário dar F5 manualmente (ver também ChunkErrorBoundary, que cobre o
// caso do import() falhar direto).
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element is missing from index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
