// Commitment Tracker — detects action items and promises from conversation text,
// persists them, and surfaces them as proactive reminders.

import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_commitments.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      raw_snippet TEXT NOT NULL,
      due_ts INTEGER,
      person TEXT,
      status TEXT DEFAULT 'pending',
      reminded_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
    CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments(due_ts);
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Commitment {
  id: number;
  text: string;
  rawSnippet: string;
  dueTs: number | null;
  person: string | null;
  status: 'pending' | 'done' | 'snoozed';
  remindedCount: number;
  createdAt: number;
}

// ─── Detection patterns ───────────────────────────────────────────────────────
interface CommitPattern {
  pattern: RegExp;
  extractCommitment: (match: RegExpExecArray) => string;
}

const COMMITMENT_PATTERNS: CommitPattern[] = [
  // Hebrew
  {
    pattern: /(?:אני\s+)?(?:צריך|חייב|אמור|עומד)\s+ל(.{4,60}?)(?:\.|$|,)/gi,
    extractCommitment: (m) => `לסיים: ${m[1]!.trim()}`,
  },
  {
    pattern: /(?:אני\s+)?אצלצל\s+(?:ל([^\s,.]+))?(.{0,40}?)(?:\.|$)/gi,
    extractCommitment: (m) => `לצלצל ${m[1] ? `ל${m[1]}` : ''} ${m[2] ?? ''}`.trim(),
  },
  {
    pattern: /(?:אני\s+)?אשלח\s+(.{4,60}?)(?:\.|$|,)/gi,
    extractCommitment: (m) => `לשלוח: ${m[1]!.trim()}`,
  },
  {
    pattern: /(?:אני\s+)?אכין\s+(.{4,60}?)(?:\.|$|,)/gi,
    extractCommitment: (m) => `להכין: ${m[1]!.trim()}`,
  },
  {
    pattern: /תזכיר\s+(?:לי\s+)?ל(.{4,60}?)(?:\.|$)/gi,
    extractCommitment: (m) => `תזכורת: ${m[1]!.trim()}`,
  },
  {
    pattern: /(?:צריך|חייב)\s+לדבר\s+(?:עם|אל)\s+([^\s,.]+)/gi,
    extractCommitment: (m) => `לדבר עם ${m[1]}`,
  },
  // English
  {
    pattern: /(?:i(?:'ll|\s+will|\s+need\s+to|\s+have\s+to|\s+must))\s+(.{4,60}?)(?:\.|$|,)/gi,
    extractCommitment: (m) => m[1]!.trim(),
  },
  {
    pattern: /(?:remind\s+me\s+to)\s+(.{4,60}?)(?:\.|$)/gi,
    extractCommitment: (m) => `Reminder: ${m[1]!.trim()}`,
  },
  {
    pattern: /(?:need\s+to|have\s+to|must)\s+(.{4,60}?)(?:\.|$|,)/gi,
    extractCommitment: (m) => m[1]!.trim(),
  },
  {
    pattern: /(?:call|email|message|text)\s+([A-Za-z]+)(?:\s+(?:about|regarding|re:)\s+(.{4,40}?))?(?:\.|$|,)/gi,
    extractCommitment: (m) => `${m[0]?.split(' ')[0]} ${m[1]} ${m[2] ? `about ${m[2]}` : ''}`.trim(),
  },
];

const DUE_PATTERNS: Array<{ pattern: RegExp; offsetMs: (m: RegExpExecArray) => number }> = [
  { pattern: /(?:מחר|tomorrow)/i, offsetMs: () => 86400000 },
  { pattern: /(?:היום|today)/i, offsetMs: () => 3600000 * 4 }, // 4h from now
  { pattern: /(?:בעוד|in)\s+(\d+)\s+(?:דקות|minutes?)/i, offsetMs: (m) => parseInt(m[1]!) * 60000 },
  { pattern: /(?:בעוד|in)\s+(\d+)\s+(?:שעות|hours?)/i, offsetMs: (m) => parseInt(m[1]!) * 3600000 },
  { pattern: /(?:בשבוע|next\s+week)/i, offsetMs: () => 7 * 86400000 },
  { pattern: /(?:בסוף\s+השבוע|this\s+weekend)/i, offsetMs: () => {
    const d = new Date();
    const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7;
    return daysUntilSat * 86400000;
  }},
];

const PERSON_IN_COMMITMENT = [
  /(?:ל|עם|אל)\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/,
  /(?:to|with|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
];

function extractDueDate(text: string): number | null {
  const now = Date.now();
  for (const { pattern, offsetMs } of DUE_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return now + offsetMs(m);
  }
  return null;
}

function extractPerson(text: string): string | null {
  for (const p of PERSON_IN_COMMITMENT) {
    const m = p.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function detectAndSaveCommitments(
  userText: string,
  aiText: string
): Promise<Commitment[]> {
  const combined = `${userText} ${aiText}`;
  const saved: Commitment[] = [];

  try {
    const db = await getDB();
    const now = Date.now();

    for (const { pattern, extractCommitment } of COMMITMENT_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(combined)) !== null) {
        const text = extractCommitment(m);
        if (text.length < 4) continue;

        const dueTs = extractDueDate(combined);
        const person = extractPerson(m[0]);

        const result = await db.runAsync(
          `INSERT OR IGNORE INTO commitments (text, raw_snippet, due_ts, person, created_at)
           VALUES (?,?,?,?,?)`,
          [text, m[0].trim().slice(0, 200), dueTs, person, now]
        );

        if (result.changes > 0) {
          const row = await db.getFirstAsync<any>(
            'SELECT * FROM commitments WHERE id = ?', [result.lastInsertRowId]
          );
          if (row) {
            saved.push(rowToCommitment(row));
          }
        }
      }
    }
  } catch {}

  return saved;
}

export async function getPendingCommitments(): Promise<Commitment[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM commitments WHERE status = 'pending'
       ORDER BY due_ts ASC NULLS LAST, created_at DESC
       LIMIT 20`
    );
    return rows.map(rowToCommitment);
  } catch {
    return [];
  }
}

export async function getOverdueCommitments(): Promise<Commitment[]> {
  try {
    const db = await getDB();
    const now = Date.now();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM commitments WHERE status = 'pending' AND due_ts IS NOT NULL AND due_ts < ?
       ORDER BY due_ts ASC`,
      [now]
    );
    return rows.map(rowToCommitment);
  } catch {
    return [];
  }
}

export async function markCommitmentDone(id: number): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(`UPDATE commitments SET status = 'done' WHERE id = ?`, [id]);
  } catch {}
}

export async function snoozeCommitment(id: number, hours = 4): Promise<void> {
  try {
    const db = await getDB();
    const newDue = Date.now() + hours * 3600000;
    await db.runAsync(
      `UPDATE commitments SET status = 'snoozed', due_ts = ?, reminded_count = reminded_count + 1 WHERE id = ?`,
      [newDue, id]
    );
  } catch {}
}

export async function deleteCommitment(id: number): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync('DELETE FROM commitments WHERE id = ?', [id]);
  } catch {}
}

export async function buildCommitmentsContextString(): Promise<string> {
  const overdue = await getOverdueCommitments();
  const pending = await getPendingCommitments();

  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(`⚠️ התחייבויות שעברו: ${overdue.map((c) => c.text).join('; ')}`);
  }
  if (pending.length > 0 && pending.length !== overdue.length) {
    const upcoming = pending.filter((c) => !overdue.find((o) => o.id === c.id)).slice(0, 3);
    if (upcoming.length > 0) {
      parts.push(`📌 ממתינות: ${upcoming.map((c) => c.text).join('; ')}`);
    }
  }
  return parts.join('\n');
}

function rowToCommitment(r: any): Commitment {
  return {
    id: r.id,
    text: r.text,
    rawSnippet: r.raw_snippet,
    dueTs: r.due_ts,
    person: r.person,
    status: r.status as Commitment['status'],
    remindedCount: r.reminded_count,
    createdAt: r.created_at,
  };
}
