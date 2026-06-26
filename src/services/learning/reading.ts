import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_learning.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_title TEXT NOT NULL,
    words_read INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL,
    comprehension_score INTEGER,
    date TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS book_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    genre TEXT,
    status TEXT DEFAULT 'want_to_read',
    progress_pct INTEGER DEFAULT 0,
    rating INTEGER,
    notes TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface ReadingSession {
  id?: number;
  contentTitle: string;
  wordsRead: number;
  durationSec: number;
  comprehensionScore?: number;
  date: string;
  notes?: string;
  createdAt: number;
}

export interface Book {
  id?: number;
  title: string;
  author?: string;
  genre?: string;
  status: 'want_to_read' | 'reading' | 'finished' | 'abandoned';
  progressPct: number;
  rating?: number;
  notes?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: number;
}

export async function logReadingSession(session: Omit<ReadingSession, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO reading_sessions (content_title, words_read, duration_sec, comprehension_score, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.contentTitle, session.wordsRead, session.durationSec, session.comprehensionScore ?? null, session.date, session.notes ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getReadingStats(days = 30): Promise<{
  avgWPM: number;
  totalWordsRead: number;
  totalMinutes: number;
  sessionsCount: number;
  avgComprehension: number;
  streak: number;
}> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM reading_sessions WHERE date >= ? ORDER BY date`,
    [since]
  );

  if (rows.length === 0) {
    return { avgWPM: 0, totalWordsRead: 0, totalMinutes: 0, sessionsCount: 0, avgComprehension: 0, streak: 0 };
  }

  const totalWords = rows.reduce((s, r) => s + r.words_read, 0);
  const totalSec = rows.reduce((s, r) => s + r.duration_sec, 0);
  const avgWPM = totalSec > 0 ? Math.round((totalWords / totalSec) * 60) : 0;
  const withComp = rows.filter((r) => r.comprehension_score != null);
  const avgComprehension = withComp.length > 0
    ? Math.round(withComp.reduce((s, r) => s + r.comprehension_score, 0) / withComp.length)
    : 0;

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  let streak = 0;
  let d = new Date();
  for (let i = dates.length - 1; i >= 0; i--) {
    const expected = d.toISOString().slice(0, 10);
    if (dates[i] === expected) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }

  return {
    avgWPM,
    totalWordsRead: totalWords,
    totalMinutes: Math.round(totalSec / 60),
    sessionsCount: rows.length,
    avgComprehension,
    streak,
  };
}

// ─── Speed reading drills ────────────────────────────────────────────────────

export function getSpeedReadingDrill(targetWPM: number): {
  instructions: string;
  text: string;
  wordCount: number;
  timeLimitSec: number;
} {
  const drillTexts = [
    'The ability to read quickly and retain information is a powerful skill that can be developed with consistent practice. Focus your eyes in the center of each line and let your peripheral vision capture the surrounding words.',
    'Speed reading is not about skipping words but about reducing subvocalization — the inner voice that reads each word aloud in your head. Train your brain to process text visually rather than phonetically.',
    'Chunk reading involves grouping words into meaningful phrases rather than reading word by word. This reduces the number of eye fixations per line and dramatically increases reading speed without losing comprehension.',
  ];

  const text = drillTexts[Math.floor(Math.random() * drillTexts.length)];
  const wordCount = text.split(/\s+/).length;
  const timeLimitSec = Math.round((wordCount / targetWPM) * 60);

  return {
    instructions: `Read the text below at ${targetWPM} WPM. You have ${timeLimitSec} seconds. Focus, don't subvocalize.`,
    text,
    wordCount,
    timeLimitSec,
  };
}

// ─── Book management ─────────────────────────────────────────────────────────

export async function addBook(book: Omit<Book, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO book_list (title, author, genre, status, progress_pct, rating, notes, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [book.title, book.author ?? null, book.genre ?? null, book.status, book.progressPct, book.rating ?? null, book.notes ?? null, book.startedAt ?? null, book.finishedAt ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getBooks(status?: Book['status']): Promise<Book[]> {
  const db = await getDB();
  const rows = status
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM book_list WHERE status = ? ORDER BY created_at DESC`, [status])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM book_list ORDER BY status, title`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author ?? undefined,
    genre: r.genre ?? undefined,
    status: r.status,
    progressPct: r.progress_pct,
    rating: r.rating ?? undefined,
    notes: r.notes ?? undefined,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function summarizeBook(title: string, author: string, settings: Settings): Promise<string> {
  const prompt = `Give a concise summary of "${title}" by ${author}:
1. Core premise (2 sentences)
2. Key insights (5 bullet points)
3. Who should read it and why
4. One actionable takeaway

Keep it practical and memorable.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateReadingList(
  goal: string,
  genre: string,
  settings: Settings
): Promise<Array<{ title: string; author: string; reason: string }>> {
  const prompt = `Recommend 5 books for goal: "${goal}" in genre: ${genre}

Respond with JSON array:
[{"title": "...", "author": "...", "reason": "one sentence why this book helps with the goal"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

// ─── Comprehension quiz ──────────────────────────────────────────────────────

export async function generateComprehensionQuiz(
  text: string,
  settings: Settings
): Promise<Array<{ question: string; options: string[]; correct: number }>> {
  const prompt = `Create 5 multiple-choice comprehension questions for:
"${text.slice(0, 2000)}"

Respond with JSON array:
[{"question": "...", "options": ["A", "B", "C", "D"], "correct": 0-3}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}
