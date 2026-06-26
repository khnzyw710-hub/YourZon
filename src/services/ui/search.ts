import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Universal search across all ZON data ────────────────────────────────────

export type SearchResultType =
  | 'conversation'
  | 'memory'
  | 'task'
  | 'document'
  | 'contact'
  | 'expense'
  | 'health'
  | 'setting';

export interface SearchResult {
  type: SearchResultType;
  id: string | number;
  title: string;
  preview: string;
  score: number;
  timestamp?: number;
  action?: string;
}

// ─── Fuzzy text matching ──────────────────────────────────────────────────────
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.includes(q)) return 1.0;

  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);

  let matched = 0;
  for (const qw of qWords) {
    if (tWords.some((tw) => tw.startsWith(qw) || qw.startsWith(tw))) matched++;
  }

  if (qWords.length === 0) return 0;
  return matched / qWords.length;
}

export function rankResults(results: SearchResult[]): SearchResult[] {
  return results.sort((a, b) => {
    // Primary: score (relevance)
    if (b.score !== a.score) return b.score - a.score;
    // Secondary: recency
    const aTime = a.timestamp ?? 0;
    const bTime = b.timestamp ?? 0;
    return bTime - aTime;
  });
}

// ─── Search index builder ─────────────────────────────────────────────────────
export interface SearchIndex {
  conversations: Array<{ id: string; title: string; preview: string; timestamp: number }>;
  tasks: Array<{ id: number; title: string; description: string }>;
  documents: Array<{ id: number; title: string; preview: string }>;
  contacts: Array<{ id: number; name: string; company: string; notes: string }>;
}

let _searchIndex: SearchIndex | null = null;

export function updateSearchIndex(partial: Partial<SearchIndex>): void {
  _searchIndex = { ...(_searchIndex ?? { conversations: [], tasks: [], documents: [], contacts: [] }), ...partial };
}

export function search(query: string, types?: SearchResultType[]): SearchResult[] {
  if (!_searchIndex || !query.trim()) return [];

  const results: SearchResult[] = [];
  const q = query.toLowerCase();

  // Search conversations
  if (!types || types.includes('conversation')) {
    for (const conv of _searchIndex.conversations) {
      const score = Math.max(fuzzyScore(q, conv.title), fuzzyScore(q, conv.preview) * 0.7);
      if (score > 0.3) {
        results.push({ type: 'conversation', id: conv.id, title: conv.title, preview: conv.preview, score, timestamp: conv.timestamp });
      }
    }
  }

  // Search tasks
  if (!types || types.includes('task')) {
    for (const task of _searchIndex.tasks) {
      const score = Math.max(fuzzyScore(q, task.title), fuzzyScore(q, task.description) * 0.6);
      if (score > 0.3) {
        results.push({ type: 'task', id: task.id, title: task.title, preview: task.description.slice(0, 100), score });
      }
    }
  }

  // Search documents
  if (!types || types.includes('document')) {
    for (const doc of _searchIndex.documents) {
      const score = Math.max(fuzzyScore(q, doc.title), fuzzyScore(q, doc.preview) * 0.7);
      if (score > 0.3) {
        results.push({ type: 'document', id: doc.id, title: doc.title, preview: doc.preview.slice(0, 100), score });
      }
    }
  }

  // Search contacts
  if (!types || types.includes('contact')) {
    for (const contact of _searchIndex.contacts) {
      const score = Math.max(
        fuzzyScore(q, contact.name),
        fuzzyScore(q, contact.company) * 0.6,
        fuzzyScore(q, contact.notes) * 0.4
      );
      if (score > 0.3) {
        results.push({ type: 'contact', id: contact.id, title: contact.name, preview: contact.company, score });
      }
    }
  }

  return rankResults(results).slice(0, 20);
}

// ─── AI-powered semantic search ───────────────────────────────────────────────
export async function semanticSearch(query: string, context: string, settings: Settings): Promise<string> {
  const prompt = `Find relevant information for the query: "${query}"

Context/data:
${context.slice(0, 3000)}

Return the most relevant 3-5 items with a brief explanation of why each is relevant. Be concise.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Command palette ──────────────────────────────────────────────────────────
export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  action: string;
  category: string;
}

export const ZON_COMMANDS: Command[] = [
  { id: 'new_conv', label: 'שיחה חדשה', icon: '💬', action: 'new_conversation', category: 'navigation', shortcut: '⌘N' },
  { id: 'open_settings', label: 'הגדרות', icon: '⚙️', action: 'open_settings', category: 'navigation', shortcut: '⌘,' },
  { id: 'open_memory', label: 'פתח זיכרון', icon: '🧠', action: 'open_memory', category: 'navigation' },
  { id: 'toggle_tts', label: 'הפעל/כבה דיבור', icon: '🔊', action: 'toggle_tts', category: 'audio' },
  { id: 'clear_history', label: 'מחק היסטוריה', icon: '🗑️', action: 'clear_history', category: 'data' },
  { id: 'export_data', label: 'ייצוא נתונים', icon: '📤', action: 'export_data', category: 'data' },
  { id: 'theme_dark', label: 'ערכת צבעים: כהה', icon: '🌙', action: 'theme:dark', category: 'appearance' },
  { id: 'theme_light', label: 'ערכת צבעים: בהיר', icon: '☀️', action: 'theme:light', category: 'appearance' },
];

export function searchCommands(query: string): Command[] {
  if (!query.trim()) return ZON_COMMANDS;
  const q = query.toLowerCase();
  return ZON_COMMANDS.filter(
    (cmd) => cmd.label.toLowerCase().includes(q) || cmd.description?.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q)
  ).slice(0, 8);
}
