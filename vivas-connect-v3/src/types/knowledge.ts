export type KnowledgeType = 'pdf' | 'doc' | 'url';
export type KnowledgeStatus = 'processing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  type: KnowledgeType;
  source_url: string | null;
  file_path: string | null;
  file_size_bytes: number;
  status: KnowledgeStatus;
  error_message: string | null;
  // Páginas lidas por IA (PDF escaneado). 0 = material sem custo (texto,
  // .txt, link, PDF com texto selecionável) — esses não consomem cota.
  scanned_pages: number;
  created_at: string;
  updated_at: string;
}
