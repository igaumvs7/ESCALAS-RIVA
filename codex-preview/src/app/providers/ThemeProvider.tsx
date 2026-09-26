import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAppUser } from './AppUserProvider';

// ----------------------------------------------------------------------------
// ThemeProvider — troca de paleta de cores (aba Configurações > Temas)
// ----------------------------------------------------------------------------
// Puramente visual: aplica `data-theme` na <html>, que os tokens CSS em
// globals.css leem (ver comentário "Sistema de TEMAS" lá). Nenhum componente
// precisa saber qual tema está ativo — só troca a variável.
//
// Preferência É DA CONTA (whatsapp_hub.app_users.theme via useAppUser), não
// só do navegador — pedido do dono: precisa acompanhar login em qualquer
// computador/aba anônima. localStorage continua existindo só como cache
// rápido pro primeiro paint (antes do fetch da conta terminar) — o valor da
// conta sempre GANHA assim que carrega. Por isso este provider precisa ficar
// ANINHADO DENTRO de AppUserProvider (ver App.tsx) — sem isso, useAppUser()
// não existiria aqui.
// ----------------------------------------------------------------------------

export type ThemeId =
  | 'vivas-premium'
  | 'vinho-ouro'
  | 'esmeralda-bronze'
  | 'escuridao'
  | 'profundezas-do-oceano'
  | 'praia-de-domingo'
  | 'sol-do-meio-dia'
  | 'aurora-boreal'
  | 'tempestade'
  | 'hacker';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  hint: string;
  swatch: [string, string, string]; // 3 cores pro preview do seletor
}

// Revisão 2026-08-24 (3ª rodada, reconstrução completa a pedido do dono):
// linha final por categoria —
//   1 padrão (VIVAS Premium) + 2 "clássicos premium" de cor sólida
//   (os que sobraram do teste anterior — Vinho&Ouro e Esmeralda&Bronze;
//   Grafite&Aço, Rosé&Champagne e Lilás&Prata saíram: o dono achou algumas
//   combinações "sem nada a ver com o sistema") + 5 temas CONCEITUAIS, cujo
//   NOME já entrega o tom/cor antes de abrir (pedido explícito: "quando eu
//   falar escuridão você já sabe que é escuro escuro" — Escuridão já estava
//   assim e ficou EXATAMENTE igual, é a referência de acerto pros outros 4).
// Adição 2026-08-25: "Tempestade" — nasceu como uma ideia de fundo pro
// próprio Escuridão (nuvens + raios, ver InteractiveBackground.tsx), o dono
// gostou tanto que virou tema completo próprio em vez de ficar só como
// efeito visual de login.
export const THEMES: ThemeDef[] = [
  { id: 'vivas-premium', label: 'VIVAS Premium', hint: 'Azul, dourado e branco (padrão)', swatch: ['#0A0A0F', '#E8B94A', '#3B82F6'] },
  { id: 'vinho-ouro', label: 'Vinho & Ouro Velho', hint: 'Clássico, encorpado', swatch: ['#170A10', '#D4A054', '#A62148'] },
  { id: 'esmeralda-bronze', label: 'Esmeralda & Bronze', hint: 'Elegante, "banco privado"', swatch: ['#081512', '#C99356', '#12B67A'] },
  { id: 'escuridao', label: 'Escuridão', hint: 'Escuro-escuro — quase sem cor, só sombra e um brilho gelado', swatch: ['#050506', '#E8EBF0', '#6B7686'] },
  { id: 'profundezas-do-oceano', label: 'Profundezas do Oceano', hint: 'Azul profundo, brilho bioluminescente', swatch: ['#041B22', '#00E5C7', '#1670C9'] },
  { id: 'praia-de-domingo', label: 'Praia de Domingo', hint: 'Areia quente, pôr do sol e mar', swatch: ['#1B140F', '#FF8C5A', '#2DD4BF'] },
  { id: 'sol-do-meio-dia', label: 'Sol do Meio-Dia', hint: 'Calor e brilho de deserto — dourado ofuscante', swatch: ['#1A1006', '#FFC94D', '#D4530A'] },
  { id: 'aurora-boreal', label: 'Aurora Boreal', hint: 'Verde e violeta ardendo no céu noturno', swatch: ['#050A0C', '#2EE6A8', '#A855F7'] },
  { id: 'tempestade', label: 'Tempestade', hint: 'Céu carregado, raios cortando a escuridão', swatch: ['#0B0E16', '#A8C4FF', '#5B6B8C'] },
  { id: 'hacker', label: 'Hacker', hint: 'Preto absoluto, verde neon — código caindo na tela de login', swatch: ['#000000', '#00FF66', '#00B84A'] },
];

const STORAGE_KEY = 'vivas_theme';
const DEFAULT_THEME: ThemeId = 'vivas-premium';

function isThemeId(v: string | null): v is ThemeId {
  return !!v && THEMES.some((t) => t.id === v);
}

interface ThemeContextValue {
  // Tema aplicado NA TELA agora (pode ser só um preview ainda não salvo).
  theme: ThemeId;
  // Último tema CONFIRMADO salvo na conta — usado pra saber se tem alteração
  // pendente (botão Salvar habilitado) e pra reverter se salvar falhar.
  savedTheme: ThemeId;
  // Só aplica visualmente (troca `data-theme` na hora, pra pré-visualizar) —
  // NÃO grava em lugar nenhum ainda.
  previewTheme: (id: ThemeId) => void;
  // Grava de verdade na conta (whatsapp_hub.app_users.theme). Devolve
  // true/false — quem chama decide o toast de sucesso/erro.
  commitTheme: (id: ThemeId) => Promise<boolean>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// BUG REAL corrigido (2026-08-27, relatado pelo dono: "às vezes buga, não
// salva, quando eu saio vem outro"): antes, escolher um tema aplicava E
// gravava na conta no mesmo clique, sem esperar confirmação da escrita —
// se a escrita falhasse silenciosamente, a tela continuava mostrando
// sucesso. Agora a escolha só PRÉ-VISUALIZA; um botão "Salvar" (em
// ThemeSettings.tsx) confirma a gravação de verdade, espera a resposta do
// banco, e só aí mostra sucesso — ou avisa se falhou, sem fingir que salvou.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: accountTheme, setAccountTheme } = useAppUser();
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  });
  const [savedTheme, setSavedTheme] = useState<ThemeId>(theme);

  // Assim que a conta carrega (login, ou troca de dispositivo/aba anônima),
  // o tema salvo nela sobrepõe o que estava em cache local — é a fonte de
  // verdade. Sem conta ainda carregada (accountTheme null) ou usuário nunca
  // escolheu um tema, mantém o que já estava aplicado.
  useEffect(() => {
    if (isThemeId(accountTheme) && accountTheme !== theme) {
      setThemeState(accountTheme);
      setSavedTheme(accountTheme);
      localStorage.setItem(STORAGE_KEY, accountTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const previewTheme = (id: ThemeId) => {
    setThemeState(id);
  };

  const commitTheme = async (id: ThemeId): Promise<boolean> => {
    setThemeState(id);
    try {
      await setAccountTheme(id);
      setSavedTheme(id);
      localStorage.setItem(STORAGE_KEY, id);
      return true;
    } catch {
      // Não reverte a pré-visualização na tela (menos brusco) — mas NÃO
      // grava em localStorage, então um refresh sem salvar de novo volta
      // pro último tema realmente confirmado, nunca fica "meio salvo".
      return false;
    }
  };

  const value = useMemo(
    () => ({ theme, savedTheme, previewTheme, commitTheme }),
    [theme, savedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
