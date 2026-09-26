// PREVIEW MOCK — no Supabase calls.

export interface FeedbackEntryRow {
  id: string;
  org_id: string;
  created_by: string;
  rating: number;
  comment: string | null;
  read_at: string | null;
  created_at: string;
  organizations?: { name: string } | null;
}

export function useFeedbackEntries() {
  return { entries: [] as FeedbackEntryRow[], loading: false, reload: async () => {} };
}

export async function submitFeedbackRating(_rating: number, _comment?: string): Promise<string> {
  return 'mock-id';
}

export async function markFeedbackRead(_id: string): Promise<void> {}
