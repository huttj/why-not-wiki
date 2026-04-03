export interface Topic {
  id: string;
  question: string;
  slug: string;
  category: 1 | 2 | 3;
  summary: string | null;
  llm_perspective: string | null;
  search_context: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  topic_id: string | null;
  user_id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Argument {
  id: string;
  topic_id: string;
  conversation_id: string | null;
  position: "for" | "against";
  summary: string;
  created_at: string;
}

export const CATEGORIES = {
  1: { label: "Can't work", emoji: "❌", color: "bg-red-100 text-red-800 border-red-200" },
  2: { label: "Someone's on it", emoji: "👍", color: "bg-amber-100 text-amber-800 border-amber-200" },
  3: { label: "Novel idea", emoji: "✅", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
} as const;
