import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_communication.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    end_time TEXT,
    location TEXT,
    description TEXT,
    type TEXT DEFAULT 'social',
    attendees TEXT,
    rsvp_status TEXT DEFAULT 'going',
    reminder_min INTEGER DEFAULT 60,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS event_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_title TEXT NOT NULL,
    from_person TEXT NOT NULL,
    date TEXT NOT NULL,
    details TEXT,
    responded INTEGER DEFAULT 0,
    response TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type EventType = 'social' | 'birthday' | 'work' | 'family' | 'holiday' | 'health' | 'other';
export type RsvpStatus = 'going' | 'maybe' | 'declined' | 'invited';

export interface Event {
  id?: number;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  description?: string;
  type: EventType;
  attendees?: string[];
  rsvpStatus: RsvpStatus;
  reminderMin: number;
  notes?: string;
  createdAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function saveEvent(event: Omit<Event, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO events (title, date, time, end_time, location, description, type, attendees, rsvp_status, reminder_min, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.title,
      event.date,
      event.time ?? null,
      event.endTime ?? null,
      event.location ?? null,
      event.description ?? null,
      event.type,
      event.attendees ? JSON.stringify(event.attendees) : null,
      event.rsvpStatus,
      event.reminderMin,
      event.notes ?? null,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function getUpcomingEvents(days = 30): Promise<Event[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM events WHERE date >= ? AND date <= ? AND rsvp_status != 'declined' ORDER BY date, time`,
    [today, until]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    time: r.time ?? undefined,
    endTime: r.end_time ?? undefined,
    location: r.location ?? undefined,
    description: r.description ?? undefined,
    type: r.type as EventType,
    attendees: r.attendees ? JSON.parse(r.attendees) : undefined,
    rsvpStatus: r.rsvp_status as RsvpStatus,
    reminderMin: r.reminder_min,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── AI event features ────────────────────────────────────────────────────────
export async function parseEventFromText(text: string, settings: Settings): Promise<Partial<Event>> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Parse event details from: "${text}"
Today: ${today}
Respond ONLY with JSON:
{
  "title": "event name",
  "date": "YYYY-MM-DD",
  "time": "HH:MM or null",
  "location": "place or null",
  "description": "what it's about or null",
  "type": "social|birthday|work|family|holiday|health|other"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return { ...JSON.parse(match[0]), rsvpStatus: 'going', reminderMin: 60 };
  } catch {}

  return { title: text, date: today, type: 'other', rsvpStatus: 'going', reminderMin: 60 };
}

export async function generateEventInvitation(event: Event, settings: Settings): Promise<string> {
  const prompt = `Write a warm invitation for this event:
${event.title}
Date: ${event.date}${event.time ? ` at ${event.time}` : ''}
${event.location ? `Location: ${event.location}` : ''}
${event.description ? `About: ${event.description}` : ''}

Write a brief, friendly invitation message (3-4 sentences). Include all key details.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function suggestEventIdeas(occasion: string, people: string[], budget: string, settings: Settings): Promise<string[]> {
  const prompt = `Suggest 5 event ideas for:
Occasion: ${occasion}
People: ${people.join(', ')}
Budget: ${budget}

List 5 creative but practical ideas, one per line.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 5)
    .slice(0, 5);
}

export async function generateEventChecklist(event: Event, settings: Settings): Promise<string[]> {
  const prompt = `Create a checklist for planning this event:
${event.title} on ${event.date}${event.location ? ` at ${event.location}` : ''}
${event.attendees?.length ? `${event.attendees.length} attendees` : ''}

List 8-12 specific preparation tasks. Be practical.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 5)
    .slice(0, 12);
}
