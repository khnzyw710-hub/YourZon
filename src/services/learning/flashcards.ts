import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_learning.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    card_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    hint TEXT,
    ease_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    next_review INTEGER,
    repetitions INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_cards_deck ON flashcards(deck_id)`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_cards_review ON flashcards(next_review)`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Deck {
  id?: number;
  name: string;
  description?: string;
  category: string;
  cardCount: number;
  createdAt: number;
}

export interface Flashcard {
  id?: number;
  deckId: number;
  front: string;
  back: string;
  hint?: string;
  easeFactor: number;
  intervalDays: number;
  nextReview?: number;
  repetitions: number;
  createdAt: number;
}

// ─── Deck management ──────────────────────────────────────────────────────────
export async function createDeck(deck: Omit<Deck, 'id' | 'createdAt' | 'cardCount'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO decks (name, description, category, card_count, created_at) VALUES (?, ?, ?, 0, ?)`,
    [deck.name, deck.description ?? null, deck.category, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getDecks(): Promise<Deck[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM decks ORDER BY name`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    category: r.category,
    cardCount: r.card_count,
    createdAt: r.created_at,
  }));
}

// ─── Flashcard management ─────────────────────────────────────────────────────
export async function addCard(card: Omit<Flashcard, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetitions'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO flashcards (deck_id, front, back, hint, ease_factor, interval_days, next_review, repetitions, created_at)
     VALUES (?, ?, ?, ?, 2.5, 1, ?, 0, ?)`,
    [card.deckId, card.front, card.back, card.hint ?? null, now, now]
  );
  await db.runAsync(`UPDATE decks SET card_count = card_count + 1 WHERE id = ?`, [card.deckId]);
  return result.lastInsertRowId;
}

export async function getDueCards(deckId?: number, limit = 20): Promise<Flashcard[]> {
  const db = await getDB();
  const now = Date.now();
  const rows = deckId
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM flashcards WHERE deck_id = ? AND (next_review IS NULL OR next_review <= ?) ORDER BY next_review ASC LIMIT ?`, [deckId, now, limit])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM flashcards WHERE next_review IS NULL OR next_review <= ? ORDER BY next_review ASC LIMIT ?`, [now, limit]);

  return rows.map(parseCardRow);
}

function parseCardRow(r: Record<string, any>): Flashcard {
  return {
    id: r.id,
    deckId: r.deck_id,
    front: r.front,
    back: r.back,
    hint: r.hint ?? undefined,
    easeFactor: r.ease_factor,
    intervalDays: r.interval_days,
    nextReview: r.next_review ?? undefined,
    repetitions: r.repetitions,
    createdAt: r.created_at,
  };
}

// ─── SM-2 spaced repetition algorithm ────────────────────────────────────────
// quality: 0-5 (0=complete blackout, 5=perfect)
export async function reviewCard(cardId: number, quality: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
  const db = await getDB();
  const card = await db.getFirstAsync<{ ease_factor: number; interval_days: number; repetitions: number }>(
    `SELECT ease_factor, interval_days, repetitions FROM flashcards WHERE id = ?`, [cardId]
  );
  if (!card) return;

  let { ease_factor, interval_days, repetitions } = card;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = Math.round(interval_days * ease_factor);

    ease_factor = Math.max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    repetitions++;
  } else {
    // Incorrect — reset
    repetitions = 0;
    interval_days = 1;
  }

  const nextReview = Date.now() + interval_days * 86400000;
  await db.runAsync(
    `UPDATE flashcards SET ease_factor = ?, interval_days = ?, next_review = ?, repetitions = ? WHERE id = ?`,
    [ease_factor, interval_days, nextReview, repetitions, cardId]
  );
}

// ─── AI card generation ───────────────────────────────────────────────────────
export async function generateFlashcardsFromText(text: string, count: number, settings: Settings): Promise<Array<{ front: string; back: string }>> {
  const prompt = `Create ${count} high-quality flashcards from this text:
${text.slice(0, 3000)}

Respond with JSON array:
[{"front": "question or term", "back": "answer or definition"}]

Make cards atomic (one concept per card), clear, and testable.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, count);
  } catch {}

  return [];
}

export async function generateFlashcardsForTopic(topic: string, count: number, level: string, settings: Settings): Promise<Array<{ front: string; back: string; hint?: string }>> {
  const prompt = `Create ${count} flashcards about "${topic}" for ${level} learners.

Respond with JSON array:
[{"front": "question", "back": "answer", "hint": "optional memory hint"}]

Cover key concepts, definitions, and applications.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, count);
  } catch {}

  return [];
}

// ─── Study stats ──────────────────────────────────────────────────────────────
export async function getStudyStats(deckId?: number): Promise<{
  totalCards: number;
  dueNow: number;
  masteredCards: number;
  avgEaseFactor: number;
}> {
  const db = await getDB();
  const now = Date.now();
  const where = deckId ? `WHERE deck_id = ${deckId}` : '';

  const [total, due, mastered, easeFactor] = await Promise.all([
    db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM flashcards ${where}`),
    db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM flashcards ${where ? where + ' AND' : 'WHERE'} (next_review IS NULL OR next_review <= ${now})`),
    db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM flashcards ${where ? where + ' AND' : 'WHERE'} repetitions >= 5`),
    db.getFirstAsync<{ avg: number }>(`SELECT AVG(ease_factor) as avg FROM flashcards ${where}`),
  ]);

  return {
    totalCards: total?.count ?? 0,
    dueNow: due?.count ?? 0,
    masteredCards: mastered?.count ?? 0,
    avgEaseFactor: Math.round((easeFactor?.avg ?? 2.5) * 100) / 100,
  };
}
