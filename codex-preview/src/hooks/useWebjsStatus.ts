// PREVIEW MOCK — returns a static status without Supabase.
export type WebjsHeaderStatus = 'ready' | 'connecting' | 'blocked' | 'disconnected' | 'none';

export function useWebjsStatus(): WebjsHeaderStatus {
  return 'disconnected';
}
