import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_learning.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS language_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    level TEXT DEFAULT 'beginner',
    words_learned INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_practice INTEGER,
    total_minutes INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    word TEXT NOT NULL,
    translation TEXT NOT NULL,
    example TEXT,
    difficulty INTEGER DEFAULT 1,
    learned INTEGER DEFAULT 0,
    practice_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type LanguageCode = 'en' | 'he' | 'ar' | 'fr' | 'es' | 'de' | 'it' | 'ru' | 'zh' | 'ja';
export type ProficiencyLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'native';

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  he: 'עברית',
  ar: 'العربية',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
};

// ─── Language progress ────────────────────────────────────────────────────────
export async function getLanguageProgress(language: LanguageCode): Promise<{
  level: ProficiencyLevel;
  wordsLearned: number;
  streakDays: number;
  totalMinutes: number;
}> {
  const db = await getDB();
  const row = await db.getFirstAsync<{
    level: string; words_learned: number; streak_days: number; total_minutes: number;
  }>(`SELECT level, words_learned, streak_days, total_minutes FROM language_progress WHERE language = ?`, [language]);

  if (!row) return { level: 'beginner', wordsLearned: 0, streakDays: 0, totalMinutes: 0 };

  return {
    level: row.level as ProficiencyLevel,
    wordsLearned: row.words_learned,
    streakDays: row.streak_days,
    totalMinutes: row.total_minutes,
  };
}

export async function logLanguagePractice(language: LanguageCode, minutes: number, wordsLearned = 0): Promise<void> {
  const db = await getDB();
  const today = Date.now();
  const existing = await db.getFirstAsync<{ id: number; last_practice: number; streak_days: number }>(
    `SELECT id, last_practice, streak_days FROM language_progress WHERE language = ?`, [language]
  );

  if (existing) {
    const lastDate = new Date(existing.last_practice).toDateString();
    const todayDate = new Date(today).toDateString();
    const yesterdayDate = new Date(today - 86400000).toDateString();

    let newStreak = existing.streak_days;
    if (lastDate === yesterdayDate) newStreak++;
    else if (lastDate !== todayDate) newStreak = 1;

    await db.runAsync(
      `UPDATE language_progress SET total_minutes = total_minutes + ?, words_learned = words_learned + ?, streak_days = ?, last_practice = ? WHERE id = ?`,
      [minutes, wordsLearned, newStreak, today, existing.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO language_progress (language, level, words_learned, streak_days, last_practice, total_minutes, created_at)
       VALUES (?, 'beginner', ?, 1, ?, ?, ?)`,
      [language, wordsLearned, today, minutes, today]
    );
  }
}

// ─── Vocabulary ───────────────────────────────────────────────────────────────
export async function addVocabularyWord(language: LanguageCode, word: string, translation: string, example?: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR IGNORE INTO vocabulary (language, word, translation, example, difficulty, learned, practice_count, created_at)
     VALUES (?, ?, ?, ?, 1, 0, 0, ?)`,
    [language, word, translation, example ?? null, Date.now()]
  );
}

export async function getVocabularyForReview(language: LanguageCode, limit = 10): Promise<Array<{
  id: number; word: string; translation: string; example?: string;
}>> {
  const db = await getDB();
  const rows = await db.getAllAsync<{
    id: number; word: string; translation: string; example: string | null;
  }>(`SELECT id, word, translation, example FROM vocabulary WHERE language = ? AND learned = 0 ORDER BY practice_count ASC, created_at ASC LIMIT ?`, [language, limit]);

  return rows.map((r) => ({
    id: r.id,
    word: r.word,
    translation: r.translation,
    example: r.example ?? undefined,
  }));
}

// ─── AI language features ─────────────────────────────────────────────────────
export async function conductConversationPractice(
  language: LanguageCode,
  topic: string,
  level: ProficiencyLevel,
  userMessage: string,
  settings: Settings
): Promise<{ response: string; corrections: string[]; newWords: string[] }> {
  const prompt = `Language practice conversation in ${LANGUAGE_NAMES[language]}.
Level: ${level}
Topic: ${topic}

Student said: "${userMessage}"

Respond in ${LANGUAGE_NAMES[language]} at ${level} level.
After your response, on a new line write:
CORRECTIONS: [list any grammar/vocab mistakes, or "None"]
NEW_WORDS: [2-3 useful words from your response with translations]`;

  const { response } = await routeToAI(prompt, [], settings);

  const corrMatch = response.match(/CORRECTIONS:\s*(.+?)(?:\n|$)/s);
  const wordsMatch = response.match(/NEW_WORDS:\s*(.+?)(?:\n|$)/s);

  const mainResponse = response.replace(/CORRECTIONS:.*/s, '').trim();
  const corrections = corrMatch?.[1]?.split(',').map((s) => s.trim()).filter((s) => s && s !== 'None') ?? [];
  const newWords = wordsMatch?.[1]?.split(',').map((s) => s.trim()).filter((s) => s) ?? [];

  return { response: mainResponse, corrections, newWords };
}

export async function translateWithContext(
  text: string,
  fromLang: LanguageCode,
  toLang: LanguageCode,
  context: string,
  settings: Settings
): Promise<{ translation: string; alternatives: string[]; notes: string }> {
  const prompt = `Translate from ${LANGUAGE_NAMES[fromLang]} to ${LANGUAGE_NAMES[toLang]}:
Text: "${text}"
Context: ${context}

Respond with JSON:
{"translation": "...", "alternatives": ["alt1", "alt2"], "notes": "any cultural or linguistic notes"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { translation: text, alternatives: [], notes: '' };
}

export async function explainGrammar(rule: string, language: LanguageCode, settings: Settings): Promise<string> {
  const prompt = `Explain this ${LANGUAGE_NAMES[language]} grammar rule clearly:
"${rule}"

Use simple language, provide 3 examples, and contrast with common mistakes.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateDailyVocabulary(language: LanguageCode, count: number, topic: string, settings: Settings): Promise<Array<{
  word: string; translation: string; example: string; pronunciation?: string;
}>> {
  const prompt = `Generate ${count} ${LANGUAGE_NAMES[language]} vocabulary words about "${topic}":

Respond with JSON array:
[{"word": "...", "translation": "Hebrew/English translation", "example": "sentence using the word", "pronunciation": "phonetic guide"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]).slice(0, count);
  } catch {}

  return [];
}
