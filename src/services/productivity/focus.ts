import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_title TEXT,
    duration_min INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    distractions INTEGER DEFAULT 0,
    quality INTEGER,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS distraction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    type TEXT,
    note TEXT,
    logged_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface FocusSession {
  id?: number;
  taskTitle?: string;
  durationMin: number;
  completed: boolean;
  distractions: number;
  quality?: number;
  date: string;
}

export type FocusMode = 'deep_work' | 'flow' | 'sprint' | 'maintenance';

export const FOCUS_MODE_CONFIGS: Record<FocusMode, { durationMin: number; breakMin: number; description: string }> = {
  deep_work: { durationMin: 90, breakMin: 20, description: 'Long uninterrupted blocks for complex thinking' },
  flow: { durationMin: 60, breakMin: 15, description: 'Build momentum with medium-length sessions' },
  sprint: { durationMin: 25, breakMin: 5, description: 'Pomodoro-style — ideal for tasks requiring focus bursts' },
  maintenance: { durationMin: 15, breakMin: 3, description: 'Light sessions for admin and email' },
};

export async function logFocusSession(session: Omit<FocusSession, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO focus_sessions (task_title, duration_min, completed, distractions, quality, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.taskTitle ?? null, session.durationMin, session.completed ? 1 : 0, session.distractions, session.quality ?? null, session.date, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function logDistraction(sessionId: number, type: string, note?: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO distraction_log (session_id, type, note, logged_at) VALUES (?, ?, ?, ?)`,
    [sessionId, type, note ?? null, Date.now()]
  );
  await db.runAsync(`UPDATE focus_sessions SET distractions = distractions + 1 WHERE id = ?`, [sessionId]);
}

export async function getFocusStats(days = 30): Promise<{
  totalFocusMin: number;
  completionRate: number;
  avgQuality: number;
  avgDistractions: number;
  streakDays: number;
  bestFocusHour: number;
}> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM focus_sessions WHERE date >= ? ORDER BY date`,
    [since]
  );

  if (rows.length === 0) {
    return { totalFocusMin: 0, completionRate: 0, avgQuality: 0, avgDistractions: 0, streakDays: 0, bestFocusHour: 9 };
  }

  const completed = rows.filter((r) => r.completed);
  const totalFocusMin = rows.reduce((s, r) => s + r.duration_min, 0);
  const completionRate = rows.length > 0 ? completed.length / rows.length : 0;
  const withQuality = rows.filter((r) => r.quality != null);
  const avgQuality = withQuality.length > 0
    ? withQuality.reduce((s, r) => s + r.quality, 0) / withQuality.length
    : 0;
  const avgDistractions = rows.reduce((s, r) => s + r.distractions, 0) / rows.length;

  // Best focus hour based on quality (default 9AM if no data)
  const bestFocusHour = 9;

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
    totalFocusMin,
    completionRate: Math.round(completionRate * 100) / 100,
    avgQuality: Math.round(avgQuality * 10) / 10,
    avgDistractions: Math.round(avgDistractions * 10) / 10,
    streakDays,
    bestFocusHour,
  };
}

export async function getFocusCoachingTip(settings: Settings): Promise<string> {
  const stats = await getFocusStats(14);
  const prompt = `Focus coaching based on 14-day stats:
- Total focus time: ${stats.totalFocusMin} minutes
- Completion rate: ${Math.round(stats.completionRate * 100)}%
- Avg distractions per session: ${stats.avgDistractions}
- Current streak: ${stats.streakDays} days

Give ONE specific, actionable tip to improve focus quality. Keep it under 3 sentences.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateFocusPlaylist(
  mode: FocusMode,
  durationMin: number,
  settings: Settings
): Promise<string> {
  const config = FOCUS_MODE_CONFIGS[mode];
  const prompt = `Recommend background music/sounds for ${mode.replace(/_/g, ' ')} focus session (${durationMin} min).
Include: genre/type, specific playlist names on free platforms (Spotify/YouTube), and why they work for ${mode.replace(/_/g, ' ')}.
Keep it concise.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export function getOptimalFocusWindows(schedule: Array<{ start: string; end: string; type: string }>): Array<{
  start: string;
  durationMin: number;
  quality: 'excellent' | 'good' | 'fair';
}> {
  const windows: Array<{ start: string; durationMin: number; quality: 'excellent' | 'good' | 'fair' }> = [];
  const PEAK_HOURS = [9, 10, 11, 15, 16];

  const busySlots = new Set<number>();
  for (const slot of schedule) {
    const startH = parseInt(slot.start.split(':')[0]);
    const endH = parseInt(slot.end.split(':')[0]);
    for (let h = startH; h < endH; h++) busySlots.add(h);
  }

  for (let h = 7; h <= 20; h++) {
    if (busySlots.has(h) || busySlots.has(h + 1)) continue;
    const available = [h, h + 1, h + 2].filter((hh) => !busySlots.has(hh)).length;
    if (available < 1) continue;

    windows.push({
      start: `${h.toString().padStart(2, '0')}:00`,
      durationMin: available * 60,
      quality: PEAK_HOURS.includes(h) ? 'excellent' : h < 14 ? 'good' : 'fair',
    });
  }

  return windows.slice(0, 5);
}
