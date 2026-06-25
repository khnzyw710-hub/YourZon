// Passive Recorder — always-on "second ear". Captures and segments everything
// heard when passive mode is active. No wake word needed. Segments by silence.

import * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_passive.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS passive_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      duration_sec INTEGER DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      people TEXT DEFAULT '[]',
      topics TEXT DEFAULT '[]',
      location_label TEXT,
      session_type TEXT DEFAULT 'conversation',
      summary TEXT,
      created_at INTEGER NOT NULL,
      day TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_passive_day ON passive_segments(day);
    CREATE INDEX IF NOT EXISTS idx_passive_created ON passive_segments(created_at);
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type SessionType = 'conversation' | 'lecture' | 'meeting' | 'phone_call' | 'ambient' | 'solo';

export interface PassiveSegment {
  id: number;
  text: string;
  durationSec: number;
  wordCount: number;
  people: string[];
  topics: string[];
  locationLabel: string | null;
  sessionType: SessionType;
  summary: string | null;
  createdAt: number;
  day: string;
}

// ─── Passive recording state ──────────────────────────────────────────────────
const SEGMENT_GAP_MS = 30000;    // 30s silence = new segment
const MIN_WORDS_TO_SAVE = 10;    // Ignore very short captures

interface PassiveBuffer {
  chunks: string[];
  startedAt: number;
  lastChunkAt: number;
  locationLabel: string | null;
}

let _buffer: PassiveBuffer | null = null;
let _isActive = false;
let _gapTimer: ReturnType<typeof setTimeout> | null = null;
let _currentLocationLabel: string | null = null;
let _onSegmentSaved: ((seg: PassiveSegment) => void) | null = null;

// ─── Session type detection ───────────────────────────────────────────────────
function detectSessionType(text: string): SessionType {
  const lower = text.toLowerCase();

  // Lecture/class signals
  if (/(?:שיעור|לקחים|הרצאה|מורה|פרופסור|lecture|lesson|professor|homework|assignment)/i.test(lower)) {
    return 'lecture';
  }
  // Meeting signals
  if (/(?:פגישה|ישיבה|אג'נדה|נושאים|meeting|agenda|action items|minutes|follow.?up)/i.test(lower)) {
    return 'meeting';
  }
  // Phone call signals
  if (/(?:שלום|מה שלומך|נשמע|תתקשר|שיחה|hello|how are you|call me|speaking)/i.test(lower)) {
    return 'phone_call';
  }
  // Solo thinking
  const words = text.split(/\s+/).length;
  if (words < 30) return 'ambient';

  return 'conversation';
}

// ─── Extract people from text ─────────────────────────────────────────────────
function extractPeople(text: string): string[] {
  const people = new Set<string>();

  // Hebrew names after common prefixes
  const hePattern = /(?:של|עם|ל|מ|אצל)\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/g;
  let m: RegExpExecArray | null;
  while ((m = hePattern.exec(text)) !== null) {
    if (m[1] && m[1].length > 1 && !isCommonWord(m[1])) people.add(m[1].trim());
  }

  // English capitalized names
  const enPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;
  while ((m = enPattern.exec(text)) !== null) {
    if (m[1] && !isCommonWord(m[1])) people.add(m[1].trim());
  }

  return [...people].slice(0, 8);
}

// ─── Extract topics ───────────────────────────────────────────────────────────
function extractTopics(text: string): string[] {
  const topics: string[] = [];

  const patterns = [
    /(?:על|about|regarding)\s+([^,.!?]{4,30})/gi,
    /(?:נושא|topic|subject)[:\s]+([^,.!?]{4,30})/gi,
    /(?:הפרויקט|the project|our project)\s+([^,.!?]{4,30})/gi,
  ];

  for (const p of patterns) {
    p.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null && topics.length < 5) {
      if (m[1]) topics.push(m[1].trim().slice(0, 40));
    }
  }

  return [...new Set(topics)];
}

const COMMON = new Set(['הוא', 'היא', 'אני', 'אתה', 'הם', 'אנחנו', 'the', 'and', 'but', 'for', 'was']);
function isCommonWord(w: string): boolean {
  return COMMON.has(w.toLowerCase()) || w.length < 3;
}

// ─── Flush current buffer to DB ───────────────────────────────────────────────
async function flushBuffer(): Promise<void> {
  if (!_buffer || _buffer.chunks.length === 0) return;

  const text = _buffer.chunks.join(' ').trim();
  const wordCount = text.split(/\s+/).length;

  if (wordCount < MIN_WORDS_TO_SAVE) {
    _buffer = null;
    return;
  }

  const durationSec = Math.round((Date.now() - _buffer.startedAt) / 1000);
  const sessionType = detectSessionType(text);
  const people = extractPeople(text);
  const topics = extractTopics(text);
  const day = format(new Date(_buffer.startedAt), 'yyyy-MM-dd');

  try {
    const db = await getDB();
    const result = await db.runAsync(
      `INSERT INTO passive_segments
         (text, duration_sec, word_count, people, topics, location_label, session_type, created_at, day)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        text, durationSec, wordCount,
        JSON.stringify(people), JSON.stringify(topics),
        _buffer.locationLabel, sessionType,
        _buffer.startedAt, day,
      ]
    );

    const saved = await db.getFirstAsync<any>(
      'SELECT * FROM passive_segments WHERE id = ?', [result.lastInsertRowId]
    );
    if (saved) {
      const seg = rowToSegment(saved);
      _onSegmentSaved?.(seg);
    }
  } catch {}

  _buffer = null;
}

// ─── Feed transcript chunk ────────────────────────────────────────────────────
export function feedPassiveTranscript(text: string, isFinal: boolean): void {
  if (!_isActive || !text.trim()) return;

  const now = Date.now();

  if (!_buffer) {
    _buffer = {
      chunks: [],
      startedAt: now,
      lastChunkAt: now,
      locationLabel: _currentLocationLabel,
    };
  }

  if (isFinal && text.trim().length > 2) {
    _buffer.chunks.push(text.trim());
    _buffer.lastChunkAt = now;
  }

  // Reset gap timer
  if (_gapTimer) clearTimeout(_gapTimer);
  _gapTimer = setTimeout(() => {
    flushBuffer();
  }, SEGMENT_GAP_MS);
}

// ─── Control ──────────────────────────────────────────────────────────────────
export function startPassiveMode(
  onSegment?: (seg: PassiveSegment) => void
): void {
  _isActive = true;
  _onSegmentSaved = onSegment ?? null;
  _buffer = null;
}

export function stopPassiveMode(): void {
  _isActive = false;
  if (_gapTimer) { clearTimeout(_gapTimer); _gapTimer = null; }
  flushBuffer().catch(() => {});
}

export function isPassiveActive(): boolean {
  return _isActive;
}

export function setPassiveLocation(label: string | null): void {
  _currentLocationLabel = label;
  if (_buffer) _buffer.locationLabel = label;
}

export function forceFlushPassive(): Promise<void> {
  return flushBuffer();
}

// ─── Query ────────────────────────────────────────────────────────────────────
export async function getTodaySegments(): Promise<PassiveSegment[]> {
  try {
    const db = await getDB();
    const today = format(new Date(), 'yyyy-MM-dd');
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM passive_segments WHERE day = ? ORDER BY created_at ASC',
      [today]
    );
    return rows.map(rowToSegment);
  } catch { return []; }
}

export async function getSegmentsForDay(day: string): Promise<PassiveSegment[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM passive_segments WHERE day = ? ORDER BY created_at ASC',
      [day]
    );
    return rows.map(rowToSegment);
  } catch { return []; }
}

export async function searchSegments(query: string, limit = 20): Promise<PassiveSegment[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM passive_segments WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?`,
      [`%${query}%`, limit]
    );
    return rows.map(rowToSegment);
  } catch { return []; }
}

export async function saveSegmentSummary(id: number, summary: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync('UPDATE passive_segments SET summary = ? WHERE id = ?', [summary, id]);
  } catch {}
}

export async function deleteSegment(id: number): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync('DELETE FROM passive_segments WHERE id = ?', [id]);
  } catch {}
}

// ─── Passive day stats ────────────────────────────────────────────────────────
export interface PassiveDayStats {
  totalSegments: number;
  totalWordCount: number;
  uniquePeople: string[];
  sessionBreakdown: Record<SessionType, number>;
  longestSegmentMin: number;
}

export async function getPassiveDayStats(day?: string): Promise<PassiveDayStats> {
  try {
    const db = await getDB();
    const d = day ?? format(new Date(), 'yyyy-MM-dd');
    const segs = await getSegmentsForDay(d);

    const people = new Set<string>();
    const breakdown: Record<SessionType, number> = {
      conversation: 0, lecture: 0, meeting: 0, phone_call: 0, ambient: 0, solo: 0,
    };
    let totalWords = 0;
    let longestSec = 0;

    for (const s of segs) {
      s.people.forEach((p) => people.add(p));
      breakdown[s.sessionType] = (breakdown[s.sessionType] ?? 0) + 1;
      totalWords += s.wordCount;
      if (s.durationSec > longestSec) longestSec = s.durationSec;
    }

    return {
      totalSegments: segs.length,
      totalWordCount: totalWords,
      uniquePeople: [...people],
      sessionBreakdown: breakdown,
      longestSegmentMin: Math.round(longestSec / 60),
    };
  } catch {
    return {
      totalSegments: 0, totalWordCount: 0, uniquePeople: [],
      sessionBreakdown: { conversation: 0, lecture: 0, meeting: 0, phone_call: 0, ambient: 0, solo: 0 },
      longestSegmentMin: 0,
    };
  }
}

// ─── Build full day transcript for AI summarization ───────────────────────────
export async function buildDayTranscript(day?: string): Promise<string> {
  const d = day ?? format(new Date(), 'yyyy-MM-dd');
  const segs = await getSegmentsForDay(d);
  if (segs.length === 0) return '';

  return segs.map((s) => {
    const time = format(new Date(s.createdAt), 'HH:mm');
    const loc = s.locationLabel ? ` [${s.locationLabel}]` : '';
    return `[${time}${loc}] ${s.text}`;
  }).join('\n\n');
}

function rowToSegment(r: any): PassiveSegment {
  return {
    id: r.id,
    text: r.text,
    durationSec: r.duration_sec,
    wordCount: r.word_count,
    people: JSON.parse(r.people ?? '[]'),
    topics: JSON.parse(r.topics ?? '[]'),
    locationLabel: r.location_label,
    sessionType: r.session_type as SessionType,
    summary: r.summary,
    createdAt: r.created_at,
    day: r.day,
  };
}
