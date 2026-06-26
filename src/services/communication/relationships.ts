import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_communication.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS contacts_crm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    relationship_type TEXT DEFAULT 'professional',
    company TEXT,
    role TEXT,
    notes TEXT,
    tags TEXT,
    last_contact INTEGER,
    contact_frequency_days INTEGER DEFAULT 30,
    birthday TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS interaction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    notes TEXT,
    sentiment TEXT,
    follow_up_date TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type RelationshipType = 'family' | 'friend' | 'colleague' | 'client' | 'mentor' | 'professional' | 'other';
export type InteractionType = 'call' | 'meeting' | 'email' | 'whatsapp' | 'lunch' | 'video' | 'event' | 'other';

export interface Contact {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  relationshipType: RelationshipType;
  company?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  lastContact?: number;
  contactFrequencyDays: number;
  birthday?: string;
  createdAt: number;
}

export interface Interaction {
  id?: number;
  contactId: number;
  date: string;
  type: InteractionType;
  notes?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  followUpDate?: string;
  createdAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function addContact(contact: Omit<Contact, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO contacts_crm (name, phone, email, relationship_type, company, role, notes, tags, last_contact, contact_frequency_days, birthday, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contact.name,
      contact.phone ?? null,
      contact.email ?? null,
      contact.relationshipType,
      contact.company ?? null,
      contact.role ?? null,
      contact.notes ?? null,
      contact.tags ? JSON.stringify(contact.tags) : null,
      contact.lastContact ?? null,
      contact.contactFrequencyDays,
      contact.birthday ?? null,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function logInteraction(interaction: Omit<Interaction, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO interaction_log (contact_id, date, type, notes, sentiment, follow_up_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [interaction.contactId, interaction.date, interaction.type, interaction.notes ?? null, interaction.sentiment ?? null, interaction.followUpDate ?? null, Date.now()]
  );
  // Update last_contact
  await db.runAsync(`UPDATE contacts_crm SET last_contact = ? WHERE id = ?`, [Date.now(), interaction.contactId]);
}

export async function getContacts(type?: RelationshipType): Promise<Contact[]> {
  const db = await getDB();
  const rows = type
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM contacts_crm WHERE relationship_type = ? ORDER BY name`, [type])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM contacts_crm ORDER BY name`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    relationshipType: r.relationship_type as RelationshipType,
    company: r.company ?? undefined,
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    lastContact: r.last_contact ?? undefined,
    contactFrequencyDays: r.contact_frequency_days,
    birthday: r.birthday ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── Follow-up reminders ──────────────────────────────────────────────────────
export async function getContactsDueForFollowUp(): Promise<Contact[]> {
  const db = await getDB();
  const now = Date.now();
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM contacts_crm WHERE (last_contact IS NULL OR (? - last_contact) / 86400000 >= contact_frequency_days) ORDER BY last_contact ASC LIMIT 10`,
    [now]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    relationshipType: r.relationship_type as RelationshipType,
    company: r.company ?? undefined,
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    lastContact: r.last_contact ?? undefined,
    contactFrequencyDays: r.contact_frequency_days,
    birthday: r.birthday ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getUpcomingBirthdays(days = 30): Promise<Contact[]> {
  const contacts = await getContacts();
  const today = new Date();
  const upcoming: Contact[] = [];

  for (const c of contacts) {
    if (!c.birthday) continue;
    const [, month, day] = c.birthday.split('-').map(Number);
    const thisYear = new Date(today.getFullYear(), month - 1, day);
    if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
    const daysUntil = Math.floor((thisYear.getTime() - today.getTime()) / 86400000);
    if (daysUntil <= days) upcoming.push(c);
  }

  return upcoming.sort((a, b) => {
    const getNextBirthday = (bday: string) => {
      const [, m, d] = bday.split('-').map(Number);
      const next = new Date(today.getFullYear(), m - 1, d);
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      return next.getTime();
    };
    return getNextBirthday(a.birthday!) - getNextBirthday(b.birthday!);
  });
}

// ─── AI relationship features ─────────────────────────────────────────────────
export async function generateReachOutMessage(contact: Contact, settings: Settings): Promise<string> {
  const lastContactDays = contact.lastContact
    ? Math.floor((Date.now() - contact.lastContact) / 86400000)
    : null;

  const prompt = `Write a casual, warm reach-out message to ${contact.name} (${contact.relationshipType}).
${contact.company ? `They work at ${contact.company} as ${contact.role ?? 'a professional'}.` : ''}
${lastContactDays ? `Last contacted ${lastContactDays} days ago.` : 'We haven\'t talked in a while.'}
${contact.notes ? `Notes about them: ${contact.notes}` : ''}

Write a brief, genuine message to reconnect. Don't be pushy. Keep it under 4 sentences.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function summarizeRelationship(contactId: number, settings: Settings): Promise<string> {
  const db = await getDB();
  const [contact, interactions] = await Promise.all([
    db.getFirstAsync<Record<string, any>>(`SELECT * FROM contacts_crm WHERE id = ?`, [contactId]),
    db.getAllAsync<{ date: string; type: string; notes: string | null; sentiment: string | null }>(
      `SELECT date, type, notes, sentiment FROM interaction_log WHERE contact_id = ? ORDER BY date DESC LIMIT 20`,
      [contactId]
    ),
  ]);

  if (!contact) return 'Contact not found.';

  const interactionText = interactions
    .map((i) => `${i.date}: ${i.type}${i.notes ? ` - ${i.notes}` : ''}`)
    .join('\n');

  const prompt = `Summarize this relationship:
Name: ${contact.name}
Type: ${contact.relationship_type}
${contact.company ? `Company: ${contact.company}` : ''}
${contact.notes ? `Notes: ${contact.notes}` : ''}

Interaction history:
${interactionText || 'No interactions logged yet.'}

Write a 3-sentence relationship summary and suggest a next action.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
