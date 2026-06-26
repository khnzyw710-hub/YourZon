import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS sleep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    bedtime INTEGER,
    wake_time INTEGER,
    duration_min INTEGER,
    quality INTEGER,
    dream_notes TEXT,
    interruptions INTEGER DEFAULT 0,
    sleep_aid TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_log(date)`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SleepEntry {
  id?: number;
  date: string;
  bedtime?: number;
  wakeTime?: number;
  durationMin?: number;
  quality?: 1 | 2 | 3 | 4 | 5;
  dreamNotes?: string;
  interruptions?: number;
  sleepAid?: string;
  createdAt: number;
}

export interface SleepStats {
  avgDurationMin: number;
  avgQuality: number;
  avgBedtimeHour: number;
  avgWakeHour: number;
  trend: 'improving' | 'declining' | 'stable';
  debtMin: number;
}

const RECOMMENDED_SLEEP_MIN = 480; // 8 hours

// ─── Log sleep ────────────────────────────────────────────────────────────────
export async function logSleep(entry: SleepEntry): Promise<void> {
  const db = await getDB();
  const dur =
    entry.durationMin ??
    (entry.bedtime && entry.wakeTime
      ? Math.round((entry.wakeTime - entry.bedtime) / 60000)
      : undefined);

  await db.runAsync(
    `INSERT OR REPLACE INTO sleep_log (date, bedtime, wake_time, duration_min, quality, dream_notes, interruptions, sleep_aid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.bedtime ?? null,
      entry.wakeTime ?? null,
      dur ?? null,
      entry.quality ?? null,
      entry.dreamNotes ?? null,
      entry.interruptions ?? 0,
      entry.sleepAid ?? null,
      entry.createdAt,
    ]
  );
}

// ─── Get sleep history ────────────────────────────────────────────────────────
export async function getSleepHistory(days = 14): Promise<SleepEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number;
    date: string;
    bedtime: number | null;
    wake_time: number | null;
    duration_min: number | null;
    quality: number | null;
    dream_notes: string | null;
    interruptions: number;
    sleep_aid: string | null;
    created_at: number;
  }>(`SELECT * FROM sleep_log WHERE date >= ? ORDER BY date DESC`, [since]);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    bedtime: r.bedtime ?? undefined,
    wakeTime: r.wake_time ?? undefined,
    durationMin: r.duration_min ?? undefined,
    quality: (r.quality as SleepEntry['quality']) ?? undefined,
    dreamNotes: r.dream_notes ?? undefined,
    interruptions: r.interruptions,
    sleepAid: r.sleep_aid ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── Sleep stats ──────────────────────────────────────────────────────────────
export async function getSleepStats(days = 14): Promise<SleepStats> {
  const history = await getSleepHistory(days);
  if (history.length === 0) {
    return { avgDurationMin: 0, avgQuality: 0, avgBedtimeHour: 0, avgWakeHour: 0, trend: 'stable', debtMin: 0 };
  }

  const withDuration = history.filter((h) => h.durationMin != null);
  const withQuality = history.filter((h) => h.quality != null);

  const avgDurationMin = withDuration.length > 0
    ? Math.round(withDuration.reduce((s, h) => s + h.durationMin!, 0) / withDuration.length)
    : 0;

  const avgQuality = withQuality.length > 0
    ? withQuality.reduce((s, h) => s + h.quality!, 0) / withQuality.length
    : 0;

  const withBedtime = history.filter((h) => h.bedtime != null);
  const avgBedtimeHour = withBedtime.length > 0
    ? withBedtime.reduce((s, h) => s + new Date(h.bedtime!).getHours(), 0) / withBedtime.length
    : 0;

  const withWake = history.filter((h) => h.wakeTime != null);
  const avgWakeHour = withWake.length > 0
    ? withWake.reduce((s, h) => s + new Date(h.wakeTime!).getHours(), 0) / withWake.length
    : 0;

  // Trend: compare first half vs second half
  const half = Math.floor(withDuration.length / 2);
  let trend: SleepStats['trend'] = 'stable';
  if (half > 0) {
    const recent = withDuration.slice(0, half).reduce((s, h) => s + h.durationMin!, 0) / half;
    const older = withDuration.slice(half).reduce((s, h) => s + h.durationMin!, 0) / half;
    trend = recent > older + 15 ? 'improving' : recent < older - 15 ? 'declining' : 'stable';
  }

  const totalDebt = withDuration.reduce(
    (s, h) => s + Math.max(0, RECOMMENDED_SLEEP_MIN - h.durationMin!),
    0
  );
  const debtMin = Math.round(totalDebt / Math.max(1, withDuration.length));

  return { avgDurationMin, avgQuality, avgBedtimeHour, avgWakeHour, trend, debtMin };
}

// ─── AI sleep coaching ────────────────────────────────────────────────────────
export async function getSleepCoachingTip(settings: Settings): Promise<string> {
  const stats = await getSleepStats(7);
  const prompt = `I'm an AI sleep coach. Based on these sleep stats, give one actionable tip (2 sentences max):
Average sleep: ${stats.avgDurationMin} minutes/night (goal: 480 min)
Quality: ${stats.avgQuality.toFixed(1)}/5
Trend: ${stats.trend}
Sleep debt: ${stats.debtMin} min/night
Average bedtime: ${Math.floor(stats.avgBedtimeHour)}:${String(Math.round((stats.avgBedtimeHour % 1) * 60)).padStart(2, '0')}

Give one specific, actionable tip to improve sleep.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Sleep journal parsing ────────────────────────────────────────────────────
export function parseSleepFromText(text: string): Partial<SleepEntry> {
  const entry: Partial<SleepEntry> = {};

  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|שעות|שעה)/i);
  if (hoursMatch) entry.durationMin = Math.round(parseFloat(hoursMatch[1]) * 60);

  const qualityMatch = text.match(/(\d)\/5|quality\s*(\d)|איכות\s*(\d)/i);
  if (qualityMatch) {
    const q = parseInt(qualityMatch[1] ?? qualityMatch[2] ?? qualityMatch[3]);
    if (q >= 1 && q <= 5) entry.quality = q as SleepEntry['quality'];
  }

  const bedtimeMatch = text.match(/(?:went to (?:bed|sleep)|slept at|הלכתי לישון ב)[- ]?(\d{1,2}):?(\d{0,2})?\s*(am|pm)?/i);
  if (bedtimeMatch) {
    let hour = parseInt(bedtimeMatch[1]);
    const min = parseInt(bedtimeMatch[2] ?? '0');
    const ampm = bedtimeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    const now = new Date();
    now.setHours(hour, min, 0, 0);
    entry.bedtime = now.getTime();
  }

  return entry;
}
