import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Em produção a Vercel injeta SUPABASE_URL/ANON_KEY via process.env (têm
  // prioridade). Em dev, caem para um arquivo .env/.env.local na raiz, para o
  // app já abrir configurado e pular o wizard /setup.
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? '';
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? fileEnv.SUPABASE_ANON_KEY ?? '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      // Bug conhecido do jSquash com o otimizador de deps do Vite (WASM) —
      // https://github.com/jamsinclair/jSquash#known-issues
      exclude: ['@jsquash/jpeg'],
    },
    server: {
      port: 5173,
    },
    build: {
      rollupOptions: {
        output: {
          // Separa bibliotecas de terceiros num chunk "vendor" próprio, com
          // hash proprio -- em vez de ficarem grudadas no chunk principal
          // (index-*.js), que muda a cada deploy. Assim o navegador do
          // usuario reaproveita o cache do vendor entre deploys (só muda
          // quando a gente atualiza uma dependencia de verdade), baixando
          // só o pedaço da app que realmente mudou. Não afeta chunks das
          // ferramentas pesadas (PDF/Excel) -- essas já são lazy (import()
          // dinâmico em ToolsPage/router.tsx) e só baixam quando a tela é
          // aberta, então não pesam no carregamento inicial mesmo grandes.
          // Só as libs realmente usadas em toda a app (carregam sempre,
          // não importa a tela) ganham chunk próprio. Deliberadamente SEM
          // fallback tipo `return 'vendor'` pra tudo mais -- isso junta
          // biblioteca pesada específica de uma ferramenta (pdfjs, xlsx,
          // jspdf, html2canvas, mammoth) no mesmo pacote que carrega
          // sempre, destruindo o lazy-loading que já existia (testado:
          // 1ª tentativa gerou um chunk de 3MB e um aviso de "circular
          // chunk" -- reduzido de novo antes de conferir como correto).
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-router-dom')) return 'vendor-react';
            if (/[\\/]node_modules[\\/]react[\\/]/.test(id) || /[\\/]node_modules[\\/]react-dom[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) return 'vendor-supabase';
            return undefined;
          },
        },
      },
      // Chunks grandes aqui são das ferramentas pesadas (PDF/Excel/imagem),
      // já lazy-loaded -- o aviso do Vite por tamanho não indica problema
      // real nesse caso, só sobe o teto pra parar de gerar ruído.
      chunkSizeWarningLimit: 1200,
    },
  };
});
