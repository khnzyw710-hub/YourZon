import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS time_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    category TEXT NOT NULL,
    description TEXT,
    task_id INTEGER,
    actual_duration_min INTEGER,
    productive INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_description TEXT,
    start_at INTEGER NOT NULL,
    end_at INTEGER,
    duration_min INTEGER DEFAULT 25,
    completed INTEGER DEFAULT 0,
    interruptions INTEGER DEFAULT 0
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type TimeCategory = 'deep_work' | 'meetings' | 'admin' | 'learning' | 'breaks' | 'personal' | 'other';

export interface TimeBlock {
  id?: number;
  date: string;
  startTime: string;
  endTime?: string;
  category: TimeCategory;
  description?: string;
  taskId?: number;
  actualDurationMin?: number;
  productive?: boolean;
  createdAt: number;
}

export interface PomodoroSession {
  id?: number;
  taskDescription?: string;
  startAt: number;
  endAt?: number;
  durationMin: number;
  completed: boolean;
  interruptions: number;
}

// ─── Time blocks ──────────────────────────────────────────────────────────────
export async function startTimeBlock(category: TimeCategory, description?: string, taskId?: number): Promise<number> {
  const db = await getDB();
  const now = new Date();
  const result = await db.runAsync(
    `INSERT INTO time_blocks (date, start_time, category, description, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [now.toISOString().slice(0, 10), now.toTimeString().slice(0, 5), category, description ?? null, taskId ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function endTimeBlock(id: number): Promise<void> {
  const db = await getDB();
  const block = await db.getFirstAsync<{ start_time: string; date: string }>(
    `SELECT start_time, date FROM time_blocks WHERE id = ?`, [id]
  );
  if (!block) return;

  const endTime = new Date().toTimeString().slice(0, 5);
  const startMin = parseTimeToMin(block.start_time);
  const endMin = parseTimeToMin(endTime);
  const durationMin = Math.max(0, endMin - startMin);

  await db.runAsync(
    `UPDATE time_blocks SET end_time = ?, actual_duration_min = ? WHERE id = ?`,
    [endTime, durationMin, id]
  );
}

function parseTimeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

export async function getDayTimeAnalysis(date?: string): Promise<{
  totalProductiveMin: number;
  byCategory: Record<TimeCategory, number>;
  deepWorkMin: number;
  breakMin: number;
  productivityScore: number;
}> {
  const db = await getDB();
  const d = date ?? new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{ category: string; actual_duration_min: number | null; productive: number }>(
    `SELECT category, actual_duration_min, productive FROM time_blocks WHERE date = ? AND actual_duration_min IS NOT NULL`,
    [d]
  );

  const byCategory = {} as Record<TimeCategory, number>;
  let totalProductiveMin = 0;

  for (const r of rows) {
    const cat = r.category as TimeCategory;
    const dur = r.actual_duration_min ?? 0;
    byCategory[cat] = (byCategory[cat] ?? 0) + dur;
    if (r.productive === 1) totalProductiveMin += dur;
  }

  const deepWorkMin = byCategory.deep_work ?? 0;
  const breakMin = byCategory.breaks ?? 0;
  const totalMin = rows.reduce((s, r) => s + (r.actual_duration_min ?? 0), 0);
  const productivityScore = totalMin > 0 ? Math.round((totalProductiveMin / totalMin) * 100) : 0;

  return { totalProductiveMin, byCategory, deepWorkMin, breakMin, productivityScore };
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
let _activePomodoroId: number | null = null;
let _pomodoroTimer: ReturnType<typeof setTimeout> | null = null;

export async function startPomodoro(
  taskDescription?: string,
  durationMin = 25,
  onComplete?: () => void
): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO pomodoro_sessions (task_description, start_at, duration_min, completed, interruptions) VALUES (?, ?, ?, 0, 0)`,
    [taskDescription ?? null, Date.now(), durationMin]
  );
  _activePomodoroId = result.lastInsertRowId;

  if (_pomodoroTimer) clearTimeout(_pomodoroTimer);
  _pomodoroTimer = setTimeout(async () => {
    await completePomodoro();
    onComplete?.();
  }, durationMin * 60 * 1000);

  return _activePomodoroId;
}

export async function completePomodoro(): Promise<void> {
  if (!_activePomodoroId) return;
  const db = await getDB();
  await db.runAsync(
    `UPDATE pomodoro_sessions SET end_at = ?, completed = 1 WHERE id = ?`,
    [Date.now(), _activePomodoroId]
  );
  _activePomodoroId = null;
  if (_pomodoroTimer) { clearTimeout(_pomodoroTimer); _pomodoroTimer = null; }
}

export async function interruptPomodoro(): Promise<void> {
  if (!_activePomodoroId) return;
  const db = await getDB();
  await db.runAsync(
    `UPDATE pomodoro_sessions SET interruptions = interruptions + 1 WHERE id = ?`,
    [_activePomodoroId]
  );
}

export function isPomodorActive(): boolean {
  return _activePomodoroId !== null;
}

export async function getPomodoroStats(days = 7): Promise<{
  totalSessions: number;
  completedSessions: number;
  totalFocusMin: number;
  avgInterruptions: number;
}> {
  const db = await getDB();
  const since = Date.now() - days * 86400000;
  const rows = await db.getAllAsync<{ completed: number; duration_min: number; interruptions: number }>(
    `SELECT completed, duration_min, interruptions FROM pomodoro_sessions WHERE start_at > ?`,
    [since]
  );

  const completed = rows.filter((r) => r.completed === 1);
  return {
    totalSessions: rows.length,
    completedSessions: completed.length,
    totalFocusMin: completed.reduce((s, r) => s + r.duration_min, 0),
    avgInterruptions: rows.length > 0 ? rows.reduce((s, r) => s + r.interruptions, 0) / rows.length : 0,
  };
}

// ─── AI time planning ─────────────────────────────────────────────────────────
export async function generateDayPlan(
  tasks: string[],
  workHours: { start: string; end: string },
  settings: Settings
): Promise<string> {
  const prompt = `Create an optimized daily schedule for these tasks:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Work hours: ${workHours.start} - ${workHours.end}
Today: ${new Date().toLocaleDateString()}

Apply time-blocking with deep work in the morning, meetings mid-day, admin in the afternoon.
Format each block as: "HH:MM - HH:MM | Category | Task"`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function analyzeTimeWaste(settings: Settings): Promise<string> {
  const analysis = await getDayTimeAnalysis();
  if (analysis.totalProductiveMin === 0) {
    return 'No time tracking data for today. Start a time block to track your productivity.';
  }

  const prompt = `Analyze this time usage and identify waste:
Productive time: ${analysis.totalProductiveMin} min
Deep work: ${analysis.deepWorkMin} min
Breaks: ${analysis.breakMin} min
Productivity score: ${analysis.productivityScore}%

Give 2 specific recommendations to improve time use (1-2 sentences each).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
