import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_communication.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS network_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    company TEXT,
    industry TEXT,
    met_at TEXT,
    met_date TEXT,
    linkedin_url TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    strength INTEGER DEFAULT 1,
    last_contact_date TEXT,
    follow_up_date TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS networking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    date TEXT NOT NULL,
    location TEXT,
    contacts_met INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface NetworkContact {
  id?: number;
  name: string;
  title?: string;
  company?: string;
  industry?: string;
  metAt?: string;
  metDate?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  notes?: string;
  strength: 1 | 2 | 3;
  lastContactDate?: string;
  followUpDate?: string;
}

export async function addNetworkContact(contact: Omit<NetworkContact, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO network_contacts (name, title, company, industry, met_at, met_date, linkedin_url, email, phone, notes, strength, last_contact_date, follow_up_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contact.name, contact.title ?? null, contact.company ?? null, contact.industry ?? null, contact.metAt ?? null, contact.metDate ?? null, contact.linkedinUrl ?? null, contact.email ?? null, contact.phone ?? null, contact.notes ?? null, contact.strength, contact.lastContactDate ?? null, contact.followUpDate ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getNetworkContacts(industry?: string): Promise<NetworkContact[]> {
  const db = await getDB();
  const rows = industry
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM network_contacts WHERE industry = ? ORDER BY strength DESC, name`, [industry])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM network_contacts ORDER BY strength DESC, last_contact_date DESC`);
  return rows.map(rowToContact);
}

export async function getWeakTies(): Promise<NetworkContact[]> {
  const db = await getDB();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM network_contacts WHERE strength = 1 AND (last_contact_date IS NULL OR last_contact_date < ?) ORDER BY last_contact_date ASC LIMIT 10`,
    [thirtyDaysAgo]
  );
  return rows.map(rowToContact);
}

export async function generateConnectionRequest(contact: NetworkContact, settings: Settings): Promise<string> {
  const prompt = `Write a LinkedIn connection request (under 300 chars) to:
Name: ${contact.name}
Title: ${contact.title ?? 'unknown'}
Company: ${contact.company ?? 'unknown'}
${contact.metAt ? `We met at: ${contact.metAt}` : ''}
${contact.notes ? `Context: ${contact.notes}` : ''}

Make it personal, mention something specific, not generic.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response.slice(0, 300);
}

export async function generateFollowUpMessage(
  contact: NetworkContact,
  purpose: string,
  settings: Settings
): Promise<string> {
  const daysSinceContact = contact.lastContactDate
    ? Math.round((Date.now() - new Date(contact.lastContactDate).getTime()) / 86400000)
    : null;

  const prompt = `Write a follow-up message to ${contact.name} (${contact.title ?? ''} at ${contact.company ?? ''})
Purpose: ${purpose}
${daysSinceContact ? `Days since last contact: ${daysSinceContact}` : ''}
${contact.notes ? `Notes: ${contact.notes}` : ''}

Write a warm, professional message. Platform: email/LinkedIn. Under 200 words.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function identifyNetworkGaps(industry: string, goal: string, settings: Settings): Promise<string> {
  const contacts = await getNetworkContacts(industry);
  const contactSummary = contacts.slice(0, 10)
    .map((c) => `${c.name} — ${c.title ?? ''} at ${c.company ?? ''} (strength: ${c.strength})`)
    .join('\n');

  const prompt = `Analyze networking for goal: "${goal}" in ${industry}

Current network:
${contactSummary || 'No contacts yet'}

Identify:
1. Key roles/functions missing from network
2. Specific types of people to connect with
3. Best venues/events to meet them in Israel
4. Warm introduction opportunities from existing contacts`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateElevatorPitch(
  name: string,
  role: string,
  value: string,
  settings: Settings
): Promise<{ thirtySeconds: string; sixtySeconds: string; oneLiners: string[] }> {
  const prompt = `Create elevator pitches for:
Name: ${name}
Role: ${role}
Unique value: ${value}

Respond with JSON:
{
  "thirtySeconds": "30-second pitch (75 words)",
  "sixtySeconds": "60-second pitch (150 words)",
  "oneLiners": ["3 different one-liner versions"]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {
    thirtySeconds: `I'm ${name}, a ${role} who helps with ${value}.`,
    sixtySeconds: `I'm ${name}. As a ${role}, I specialize in ${value}. I'd love to connect.`,
    oneLiners: [`${name} — ${role} specializing in ${value}`],
  };
}

function rowToContact(r: Record<string, any>): NetworkContact {
  return {
    id: r.id,
    name: r.name,
    title: r.title ?? undefined,
    company: r.company ?? undefined,
    industry: r.industry ?? undefined,
    metAt: r.met_at ?? undefined,
    metDate: r.met_date ?? undefined,
    linkedinUrl: r.linkedin_url ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    notes: r.notes ?? undefined,
    strength: r.strength as 1 | 2 | 3,
    lastContactDate: r.last_contact_date ?? undefined,
    followUpDate: r.follow_up_date ?? undefined,
  };
}
