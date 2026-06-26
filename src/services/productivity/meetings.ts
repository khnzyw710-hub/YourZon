import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    attendees TEXT,
    agenda TEXT,
    notes TEXT,
    action_items TEXT,
    summary TEXT,
    location TEXT,
    is_recurring INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Meeting {
  id?: number;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  attendees?: string[];
  agenda?: string[];
  notes?: string;
  actionItems?: string[];
  summary?: string;
  location?: string;
  isRecurring?: boolean;
  createdAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function saveMeeting(meeting: Meeting): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO meetings (title, date, start_time, end_time, attendees, agenda, notes, action_items, summary, location, is_recurring, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meeting.title,
      meeting.date,
      meeting.startTime ?? null,
      meeting.endTime ?? null,
      meeting.attendees ? JSON.stringify(meeting.attendees) : null,
      meeting.agenda ? JSON.stringify(meeting.agenda) : null,
      meeting.notes ?? null,
      meeting.actionItems ? JSON.stringify(meeting.actionItems) : null,
      meeting.summary ?? null,
      meeting.location ?? null,
      meeting.isRecurring ? 1 : 0,
      meeting.createdAt,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateMeetingNotes(id: number, notes: string, actionItems?: string[]): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE meetings SET notes = ?, action_items = ? WHERE id = ?`,
    [notes, actionItems ? JSON.stringify(actionItems) : null, id]
  );
}

export async function getUpcomingMeetings(days = 7): Promise<Meeting[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM meetings WHERE date >= ? AND date <= ? ORDER BY date, start_time`,
    [today, until]
  );
  return rows.map(parseMeetingRow);
}

export async function getPastMeetings(limit = 20): Promise<Meeting[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM meetings WHERE date < ? ORDER BY date DESC LIMIT ?`,
    [today, limit]
  );
  return rows.map(parseMeetingRow);
}

function parseMeetingRow(r: Record<string, any>): Meeting {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    attendees: r.attendees ? JSON.parse(r.attendees) : undefined,
    agenda: r.agenda ? JSON.parse(r.agenda) : undefined,
    notes: r.notes ?? undefined,
    actionItems: r.action_items ? JSON.parse(r.action_items) : undefined,
    summary: r.summary ?? undefined,
    location: r.location ?? undefined,
    isRecurring: r.is_recurring === 1,
    createdAt: r.created_at,
  };
}

// ─── AI meeting features ──────────────────────────────────────────────────────
export async function generateMeetingAgenda(
  title: string,
  attendees: string[],
  goal: string,
  durationMin: number,
  settings: Settings
): Promise<string[]> {
  const prompt = `Create a meeting agenda for:
Title: ${title}
Attendees: ${attendees.join(', ')}
Goal: ${goal}
Duration: ${durationMin} minutes

List 4-6 agenda items with time allocations. Format: "Item - X min"`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 3)
    .slice(0, 8);
}

export async function summarizeMeetingNotes(notes: string, settings: Settings): Promise<{
  summary: string;
  actionItems: string[];
  decisions: string[];
  nextSteps: string;
}> {
  const prompt = `Summarize these meeting notes and extract action items:

${notes}

Respond with JSON:
{
  "summary": "2-3 sentence summary",
  "actionItems": ["who: what by when"],
  "decisions": ["key decisions made"],
  "nextSteps": "1 sentence on immediate next steps"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary: parsed.summary ?? '',
        actionItems: parsed.actionItems ?? [],
        decisions: parsed.decisions ?? [],
        nextSteps: parsed.nextSteps ?? '',
      };
    }
  } catch {}

  return { summary: notes.slice(0, 200), actionItems: [], decisions: [], nextSteps: '' };
}

export async function generateMeetingFollowUp(meeting: Meeting, settings: Settings): Promise<string> {
  const prompt = `Write a professional follow-up email for this meeting:
Title: ${meeting.title}
Date: ${meeting.date}
Attendees: ${meeting.attendees?.join(', ') ?? 'team'}
${meeting.summary ? `Summary: ${meeting.summary}` : ''}
Action items: ${meeting.actionItems?.join('; ') ?? 'None specified'}

Write a concise, professional follow-up email (no fluff). Include action items and next steps.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function transcribeAndParseMeeting(rawTranscript: string, settings: Settings): Promise<Partial<Meeting>> {
  const prompt = `Parse this meeting transcript and extract key information:

"${rawTranscript.slice(0, 3000)}"

Respond with JSON:
{
  "title": "meeting title",
  "attendees": ["names mentioned"],
  "agenda": ["topics discussed"],
  "actionItems": ["action items with owner names"],
  "decisions": ["decisions made"],
  "summary": "2-sentence summary"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        title: parsed.title ?? 'Meeting',
        attendees: parsed.attendees ?? [],
        agenda: parsed.agenda ?? [],
        actionItems: parsed.actionItems ?? [],
        notes: parsed.decisions?.join('\n') ?? '',
        summary: parsed.summary ?? '',
        date: new Date().toISOString().slice(0, 10),
        createdAt: Date.now(),
      };
    }
  } catch {}

  return { title: 'Meeting', date: new Date().toISOString().slice(0, 10), createdAt: Date.now() };
}
