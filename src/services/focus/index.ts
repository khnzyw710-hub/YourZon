// Focus Mode — Pomodoro-style timer activated by voice or touch.
// Tracks focus sessions in SQLite. Surfaces break reminders.

import * as SQLite from 'expo-sqlite';
import * as Notifications from 'expo-notifications';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_focus.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_min INTEGER,
      completed INTEGER DEFAULT 0,
      interrupted_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at);
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FocusSession {
  id: number;
  goal: string | null;
  startedAt: number;
  endedAt: number | null;
  durationMin: number | null;
  completed: boolean;
}

export type FocusPhase = 'idle' | 'focusing' | 'break' | 'longbreak';

export interface FocusState {
  phase: FocusPhase;
  sessionGoal: string | null;
  startedAt: number | null;
  elapsedSec: number;
  remainingSec: number;
  pomodoroCount: number;
  sessionId: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const DEFAULTS = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  longBreakAfter: 4,
};

// ─── In-memory state ──────────────────────────────────────────────────────────
let _state: FocusState = {
  phase: 'idle',
  sessionGoal: null,
  startedAt: null,
  elapsedSec: 0,
  remainingSec: DEFAULTS.focusMin * 60,
  pomodoroCount: 0,
  sessionId: null,
};

let _timer: ReturnType<typeof setInterval> | null = null;
let _onStateChange: ((s: FocusState) => void) | null = null;

// ─── Timer tick ───────────────────────────────────────────────────────────────
function tick() {
  if (!_state.startedAt || _state.phase === 'idle') return;

  _state.elapsedSec = Math.floor((Date.now() - _state.startedAt) / 1000);
  const totalSec =
    _state.phase === 'focusing' ? DEFAULTS.focusMin * 60
    : _state.phase === 'longbreak' ? DEFAULTS.longBreakMin * 60
    : DEFAULTS.breakMin * 60;

  _state.remainingSec = Math.max(0, totalSec - _state.elapsedSec);

  if (_state.remainingSec <= 0) {
    onPhaseComplete();
    return;
  }

  _onStateChange?.({ ..._state });
}

async function onPhaseComplete() {
  if (_state.phase === 'focusing') {
    _state.pomodoroCount++;
    await completeFocusSession();
    const isLong = _state.pomodoroCount % DEFAULTS.longBreakAfter === 0;
    await notifyBreakTime(isLong);
    startPhase(isLong ? 'longbreak' : 'break');
  } else {
    await notifyFocusTime();
    startPhase('focusing');
  }
}

function startPhase(phase: FocusPhase) {
  _state.phase = phase;
  _state.startedAt = Date.now();
  _state.elapsedSec = 0;
  _state.remainingSec =
    phase === 'focusing' ? DEFAULTS.focusMin * 60
    : phase === 'longbreak' ? DEFAULTS.longBreakMin * 60
    : DEFAULTS.breakMin * 60;
  _onStateChange?.({ ..._state });
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function startFocus(goal?: string, onStateChange?: (s: FocusState) => void): Promise<FocusState> {
  if (_state.phase !== 'idle') stopFocus('new session started');

  _onStateChange = onStateChange ?? null;

  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    'INSERT INTO focus_sessions (goal, started_at) VALUES (?,?)',
    [goal ?? null, now]
  );

  _state = {
    phase: 'focusing',
    sessionGoal: goal ?? null,
    startedAt: now,
    elapsedSec: 0,
    remainingSec: DEFAULTS.focusMin * 60,
    pomodoroCount: _state.pomodoroCount,
    sessionId: result.lastInsertRowId,
  };

  _timer = setInterval(tick, 1000);
  _onStateChange?.({ ..._state });
  return { ..._state };
}

export async function stopFocus(reason?: string): Promise<void> {
  if (_timer) { clearInterval(_timer); _timer = null; }

  if (_state.sessionId && _state.startedAt) {
    const durationMin = Math.floor((Date.now() - _state.startedAt) / 60000);
    const db = await getDB();
    await db.runAsync(
      `UPDATE focus_sessions SET ended_at = ?, duration_min = ?, interrupted_reason = ? WHERE id = ?`,
      [Date.now(), durationMin, reason ?? null, _state.sessionId]
    );
  }

  _state = {
    phase: 'idle', sessionGoal: null, startedAt: null,
    elapsedSec: 0, remainingSec: DEFAULTS.focusMin * 60,
    pomodoroCount: _state.pomodoroCount, sessionId: null,
  };
  _onStateChange?.({ ..._state });
}

async function completeFocusSession(): Promise<void> {
  if (!_state.sessionId || !_state.startedAt) return;
  const db = await getDB();
  const now = Date.now();
  const durationMin = Math.floor((now - _state.startedAt) / 60000);
  await db.runAsync(
    `UPDATE focus_sessions SET ended_at = ?, duration_min = ?, completed = 1 WHERE id = ?`,
    [now, durationMin, _state.sessionId]
  );
}

export function getFocusState(): FocusState {
  return { ..._state };
}

export function isFocusing(): boolean {
  return _state.phase === 'focusing';
}

export async function getFocusStats(): Promise<{
  todaySessions: number;
  todayFocusMin: number;
  weekSessions: number;
  longestStreak: number;
}> {
  try {
    const db = await getDB();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

    const todayRows = await db.getAllAsync<any>(
      `SELECT * FROM focus_sessions WHERE started_at > ? AND completed = 1`,
      [dayStart.getTime()]
    );
    const weekRows = await db.getAllAsync<any>(
      `SELECT * FROM focus_sessions WHERE started_at > ? AND completed = 1`,
      [weekStart.getTime()]
    );

    const todayFocusMin = todayRows.reduce((sum: number, r: any) => sum + (r.duration_min ?? 0), 0);

    return {
      todaySessions: todayRows.length,
      todayFocusMin,
      weekSessions: weekRows.length,
      longestStreak: _state.pomodoroCount,
    };
  } catch {
    return { todaySessions: 0, todayFocusMin: 0, weekSessions: 0, longestStreak: 0 };
  }
}

export async function getRecentSessions(limit = 10): Promise<FocusSession[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT ?`, [limit]
    );
    return rows.map((r: any) => ({
      id: r.id, goal: r.goal, startedAt: r.started_at,
      endedAt: r.ended_at, durationMin: r.duration_min, completed: !!r.completed,
    }));
  } catch {
    return [];
  }
}

// ─── Voice command detection ──────────────────────────────────────────────────
export function detectFocusCommand(transcript: string): {
  action: 'start' | 'stop' | 'status' | null;
  goal?: string;
} {
  const lower = transcript.toLowerCase();

  if (/(?:התחל|תתחיל|start|begin)\s+(?:פוקוס|focus|עבודה|לעבוד)/.test(lower)) {
    const goalMatch = transcript.match(/(?:על|on|for)\s+(.{3,40}?)(?:\.|$)/i);
    return { action: 'start', goal: goalMatch?.[1]?.trim() };
  }
  if (/(?:עצור|הפסק|stop|end|finish)\s+(?:פוקוס|focus|עבודה)/.test(lower)) {
    return { action: 'stop' };
  }
  if (/(?:כמה זמן|how long|status)\s+(?:פוקוס|focus|עבדתי|worked)/.test(lower)) {
    return { action: 'status' };
  }

  return { action: null };
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function notifyBreakTime(isLong: boolean): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isLong ? '🎉 הפסקה ארוכה!' : '☕ זמן הפסקה',
        body: isLong
          ? `${DEFAULTS.longBreakMin} דקות מנוחה — עשית ${_state.pomodoroCount} פוקוסים!`
          : `${DEFAULTS.breakMin} דקות הפסקה קצרה`,
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}

async function notifyFocusTime(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎯 חזרה לפוקוס',
        body: `${DEFAULTS.focusMin} דקות ריכוז`,
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}
