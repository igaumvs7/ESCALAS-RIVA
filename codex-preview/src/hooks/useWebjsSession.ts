// Estado da sessão webjs agora é compartilhado entre todos os componentes via
// Context (ver src/app/providers/WebjsSessionProvider.tsx) — corrige tela que
// ficava presa em "conectado" após desconectar até dar F5. Este arquivo
// continua existindo só pra não precisar mudar os imports (@/hooks/useWebjsSession)
// espalhados pelo app.
export { useWebjsSession } from '@/app/providers/WebjsSessionProvider';
export type { WebjsSession, WebjsSessionStatus, WebjsBlockKind } from '@/app/providers/WebjsSessionProvider';
