import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT NOT NULL,
    mood INTEGER,
    tags TEXT,
    template TEXT,
    date TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    is_private INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS journal_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    category TEXT NOT NULL,
    used_count INTEGER DEFAULT 0,
    last_used TEXT
  )`);
  await _initDefaultPrompts();
  return _db;
}

const DEFAULT_PROMPTS = [
  { prompt: 'What was the most meaningful thing that happened today?', category: 'reflection' },
  { prompt: 'What am I grateful for right now, and why?', category: 'gratitude' },
  { prompt: 'What challenge am I avoiding, and what would happen if I faced it?', category: 'growth' },
  { prompt: 'If I could relive today differently, what would I change?', category: 'reflection' },
  { prompt: 'What small win did I have today that I haven\'t acknowledged?', category: 'celebration' },
  { prompt: 'What is my body telling me today that I might be ignoring?', category: 'health' },
  { prompt: 'What would I do if I knew I couldn\'t fail?', category: 'vision' },
  { prompt: 'Who made a positive impact on my life recently, and have I told them?', category: 'relationships' },
  { prompt: 'What belief am I holding that might be limiting me?', category: 'growth' },
  { prompt: 'What does success look like for me 1 year from now?', category: 'vision' },
];

let _promptsInitialized = false;
async function _initDefaultPrompts(): Promise<void> {
  if (_promptsInitialized || !_db) return;
  _promptsInitialized = true;
  for (const p of DEFAULT_PROMPTS) {
    await _db.runAsync(
      `INSERT OR IGNORE INTO journal_prompts (prompt, category) VALUES (?, ?)`,
      [p.prompt, p.category]
    );
  }
}

export interface JournalEntry {
  id?: number;
  title?: string;
  content: string;
  mood?: number;
  tags: string[];
  template?: string;
  date: string;
  wordCount: number;
  isPrivate: boolean;
}

export async function createEntry(entry: Omit<JournalEntry, 'id' | 'wordCount'>): Promise<number> {
  const db = await getDB();
  const wordCount = entry.content.split(/\s+/).filter(Boolean).length;
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO journal_entries (title, content, mood, tags, template, date, word_count, is_private, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.title ?? null, entry.content, entry.mood ?? null, JSON.stringify(entry.tags), entry.template ?? null, entry.date, wordCount, entry.isPrivate ? 1 : 0, now, now]
  );
  return result.lastInsertRowId;
}

export async function getEntries(days = 30): Promise<JournalEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM journal_entries WHERE date >= ? ORDER BY date DESC`,
    [since]
  );
  return rows.map(rowToEntry);
}

export async function getEntry(id: number): Promise<JournalEntry | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM journal_entries WHERE id = ?`, [id]);
  return row ? rowToEntry(row) : null;
}

export async function getJournalStats(days = 30): Promise<{
  totalEntries: number;
  totalWords: number;
  avgWordsPerEntry: number;
  streakDays: number;
  avgMood?: number;
}> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM journal_entries WHERE date >= ? ORDER BY date DESC`,
    [since]
  );

  const totalWords = rows.reduce((s, r) => s + r.word_count, 0);
  const moods = rows.filter((r) => r.mood != null).map((r) => r.mood as number);
  const avgMood = moods.length > 0 ? moods.reduce((s, m) => s + m, 0) / moods.length : undefined;

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  let streakDays = 0;
  let d = new Date();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] === d.toISOString().slice(0, 10)) {
      streakDays++;
      d.setDate(d.getDate() - 1);
    } else break;
  }

  return {
    totalEntries: rows.length,
    totalWords,
    avgWordsPerEntry: rows.length > 0 ? Math.round(totalWords / rows.length) : 0,
    streakDays,
    avgMood: avgMood ? Math.round(avgMood * 10) / 10 : undefined,
  };
}

export async function getDailyPrompt(category?: string): Promise<string> {
  const db = await getDB();
  const row = category
    ? await db.getFirstAsync<{ prompt: string }>(`SELECT prompt FROM journal_prompts WHERE category = ? ORDER BY RANDOM() LIMIT 1`, [category])
    : await db.getFirstAsync<{ prompt: string }>(`SELECT prompt FROM journal_prompts ORDER BY used_count ASC, RANDOM() LIMIT 1`);
  return row?.prompt ?? 'What is on your mind today?';
}

export async function analyzeJournalPatterns(settings: Settings): Promise<string> {
  const entries = await getEntries(30);
  if (entries.length === 0) return 'No journal entries to analyze yet.';

  const sample = entries.slice(0, 10).map((e) =>
    `[${e.date}] (mood: ${e.mood ?? '?'}/10): ${e.content.slice(0, 200)}...`
  ).join('\n\n');

  const prompt = `Analyze these journal entries for patterns and insights:
${sample}

Identify:
1. Recurring themes (positive and challenging)
2. Emotional patterns over time
3. Hidden beliefs or assumptions
4. Growth areas worth exploring
5. One reflective question to deepen self-understanding

Be insightful but compassionate.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateJournalPromptForMood(moodScore: number, settings: Settings): Promise<string> {
  const prompt = `Generate a thoughtful journal prompt for someone feeling mood level ${moodScore}/10.
${moodScore <= 3 ? 'They are feeling quite low.' : moodScore <= 6 ? 'They are feeling neutral to slightly off.' : 'They are feeling good.'}

Make the prompt supportive and growth-oriented. One sentence question only.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response.replace(/^["']|["']$/g, '').trim();
}

function rowToEntry(r: Record<string, any>): JournalEntry {
  return {
    id: r.id,
    title: r.title ?? undefined,
    content: r.content,
    mood: r.mood ?? undefined,
    tags: JSON.parse(r.tags ?? '[]'),
    template: r.template ?? undefined,
    date: r.date,
    wordCount: r.word_count,
    isPrivate: Boolean(r.is_private),
  };
}
