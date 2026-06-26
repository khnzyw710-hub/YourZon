import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS mood_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    mood INTEGER NOT NULL,
    energy INTEGER,
    anxiety INTEGER,
    notes TEXT,
    triggers TEXT,
    gratitude TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS meditation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    type TEXT DEFAULT 'mindfulness',
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MoodEntry {
  id?: number;
  date: string;
  mood: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  energy?: 1 | 2 | 3 | 4 | 5;
  anxiety?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  triggers?: string[];
  gratitude?: string[];
  createdAt: number;
}

export interface MoodStats {
  avgMood: number;
  avgEnergy: number;
  avgAnxiety: number;
  trend: 'improving' | 'declining' | 'stable';
  moodByDayOfWeek: number[];
  topTriggers: string[];
}

// ─── Log mood ─────────────────────────────────────────────────────────────────
export async function logMood(entry: MoodEntry): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO mood_log (date, mood, energy, anxiety, notes, triggers, gratitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.mood,
      entry.energy ?? null,
      entry.anxiety ?? null,
      entry.notes ?? null,
      entry.triggers ? JSON.stringify(entry.triggers) : null,
      entry.gratitude ? JSON.stringify(entry.gratitude) : null,
      entry.createdAt,
    ]
  );
}

// ─── Mood history & stats ─────────────────────────────────────────────────────
export async function getMoodHistory(days = 30): Promise<MoodEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number; date: string; mood: number; energy: number | null;
    anxiety: number | null; notes: string | null; triggers: string | null;
    gratitude: string | null; created_at: number;
  }>(`SELECT * FROM mood_log WHERE date >= ? ORDER BY date DESC`, [since]);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    mood: r.mood as MoodEntry['mood'],
    energy: (r.energy as MoodEntry['energy']) ?? undefined,
    anxiety: (r.anxiety as MoodEntry['anxiety']) ?? undefined,
    notes: r.notes ?? undefined,
    triggers: r.triggers ? JSON.parse(r.triggers) : undefined,
    gratitude: r.gratitude ? JSON.parse(r.gratitude) : undefined,
    createdAt: r.created_at,
  }));
}

export async function getMoodStats(days = 14): Promise<MoodStats> {
  const history = await getMoodHistory(days);
  if (history.length === 0) {
    return { avgMood: 5, avgEnergy: 3, avgAnxiety: 3, trend: 'stable', moodByDayOfWeek: Array(7).fill(5), topTriggers: [] };
  }

  const avgMood = history.reduce((s, h) => s + h.mood, 0) / history.length;
  const withEnergy = history.filter((h) => h.energy != null);
  const avgEnergy = withEnergy.length > 0 ? withEnergy.reduce((s, h) => s + h.energy!, 0) / withEnergy.length : 3;
  const withAnxiety = history.filter((h) => h.anxiety != null);
  const avgAnxiety = withAnxiety.length > 0 ? withAnxiety.reduce((s, h) => s + h.anxiety!, 0) / withAnxiety.length : 3;

  const half = Math.floor(history.length / 2);
  let trend: MoodStats['trend'] = 'stable';
  if (half > 0) {
    const recent = history.slice(0, half).reduce((s, h) => s + h.mood, 0) / half;
    const older = history.slice(half).reduce((s, h) => s + h.mood, 0) / half;
    trend = recent > older + 0.5 ? 'improving' : recent < older - 0.5 ? 'declining' : 'stable';
  }

  const moodByDayOfWeek = Array(7).fill(0);
  const countByDay = Array(7).fill(0);
  for (const h of history) {
    const dow = new Date(h.date).getDay();
    moodByDayOfWeek[dow] += h.mood;
    countByDay[dow]++;
  }
  for (let i = 0; i < 7; i++) {
    moodByDayOfWeek[i] = countByDay[i] > 0 ? moodByDayOfWeek[i] / countByDay[i] : 5;
  }

  const triggerFreq: Record<string, number> = {};
  for (const h of history) {
    if (h.triggers) {
      for (const t of h.triggers) triggerFreq[t] = (triggerFreq[t] ?? 0) + 1;
    }
  }
  const topTriggers = Object.entries(triggerFreq).sort(([, a], [, b]) => b - a).slice(0, 5).map(([t]) => t);

  return { avgMood, avgEnergy, avgAnxiety, trend, moodByDayOfWeek, topTriggers };
}

// ─── AI mental wellness coaching ──────────────────────────────────────────────
export async function getMentalWellnessTip(settings: Settings): Promise<string> {
  const stats = await getMoodStats(7);
  const prompt = `Mental wellness coach. Based on 7-day mood stats:
Avg mood: ${stats.avgMood.toFixed(1)}/10
Avg energy: ${stats.avgEnergy.toFixed(1)}/5
Avg anxiety: ${stats.avgAnxiety.toFixed(1)}/5
Trend: ${stats.trend}
${stats.topTriggers.length > 0 ? `Common triggers: ${stats.topTriggers.join(', ')}` : ''}

Give one specific, evidence-based mental wellness tip (2 sentences max).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Gratitude journal ────────────────────────────────────────────────────────
export async function logGratitude(items: string[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const db = await getDB();
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM mood_log WHERE date = ?`, [today]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE mood_log SET gratitude = ? WHERE id = ?`,
      [JSON.stringify(items), existing.id]
    );
  } else {
    await logMood({
      date: today,
      mood: 5,
      gratitude: items,
      createdAt: Date.now(),
    });
  }
}

export async function getRecentGratitude(days = 7): Promise<string[][]> {
  const history = await getMoodHistory(days);
  return history.filter((h) => h.gratitude && h.gratitude.length > 0).map((h) => h.gratitude!);
}

// ─── Meditation tracking ──────────────────────────────────────────────────────
export async function logMeditation(durationMin: number, type = 'mindfulness', notes = ''): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO meditation_log (date, duration_min, type, notes, created_at) VALUES (?, ?, ?, ?, ?)`,
    [new Date().toISOString().slice(0, 10), durationMin, type, notes, Date.now()]
  );
}

export async function getMeditationStreak(): Promise<number> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM meditation_log ORDER BY date DESC LIMIT 60`
  );
  if (rows.length === 0) return 0;

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let current = today;

  for (const row of rows) {
    if (row.date === current) {
      streak++;
      const d = new Date(current);
      d.setDate(d.getDate() - 1);
      current = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

// ─── Breathing exercise guide ─────────────────────────────────────────────────
export interface BreathingExercise {
  name: string;
  inhaleS: number;
  holdS: number;
  exhaleS: number;
  cycles: number;
  description: string;
}

export const BREATHING_EXERCISES: BreathingExercise[] = [
  { name: '4-7-8', inhaleS: 4, holdS: 7, exhaleS: 8, cycles: 4, description: 'Relaxing and sleep-promoting' },
  { name: 'Box Breathing', inhaleS: 4, holdS: 4, exhaleS: 4, cycles: 6, description: 'Used by Navy SEALs for calm focus' },
  { name: 'Wim Hof (Light)', inhaleS: 3, holdS: 0, exhaleS: 2, cycles: 10, description: 'Energizing and stress-reducing' },
  { name: 'Coherent Breathing', inhaleS: 5, holdS: 0, exhaleS: 5, cycles: 12, description: 'Heart rate variability optimizer' },
];
