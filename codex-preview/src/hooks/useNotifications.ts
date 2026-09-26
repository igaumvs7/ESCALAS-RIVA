// PREVIEW MOCK — no Supabase calls.

export type NotificationType = 'new_message' | 'handoff' | 'mention' | 'feedback';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  conversation_id: string | null;
  message_id: string | null;
  feedback_thread_id: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markReadByConversation: (conversationId: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  return {
    notifications: [],
    unreadCount: 0,
    loading: false,
    markRead: async () => {},
    markAllRead: async () => {},
    markReadByConversation: async () => {},
    reload: async () => {},
  };
}
