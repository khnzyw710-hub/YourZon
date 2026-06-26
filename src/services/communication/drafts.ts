import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_communication.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS message_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_person TEXT,
    subject TEXT,
    body TEXT NOT NULL,
    channel TEXT DEFAULT 'email',
    tone TEXT DEFAULT 'professional',
    status TEXT DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    placeholders TEXT,
    use_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type MessageChannel = 'email' | 'whatsapp' | 'sms' | 'linkedin' | 'slack';
export type MessageTone = 'professional' | 'friendly' | 'formal' | 'casual' | 'urgent' | 'empathetic';

export interface MessageDraft {
  id?: number;
  toPerson?: string;
  subject?: string;
  body: string;
  channel: MessageChannel;
  tone: MessageTone;
  status: 'draft' | 'sent' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface MessageTemplate {
  id?: number;
  name: string;
  category: string;
  subject?: string;
  body: string;
  placeholders?: string[];
  useCount: number;
  createdAt: number;
}

// ─── Drafts ───────────────────────────────────────────────────────────────────
export async function saveDraft(draft: Omit<MessageDraft, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO message_drafts (to_person, subject, body, channel, tone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [draft.toPerson ?? null, draft.subject ?? null, draft.body, draft.channel, draft.tone, draft.status, now, now]
  );
  return result.lastInsertRowId;
}

export async function getDrafts(channel?: MessageChannel): Promise<MessageDraft[]> {
  const db = await getDB();
  const rows = channel
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM message_drafts WHERE status = 'draft' AND channel = ? ORDER BY updated_at DESC`, [channel])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM message_drafts WHERE status = 'draft' ORDER BY updated_at DESC`);

  return rows.map((r) => ({
    id: r.id,
    toPerson: r.to_person ?? undefined,
    subject: r.subject ?? undefined,
    body: r.body,
    channel: r.channel as MessageChannel,
    tone: r.tone as MessageTone,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ─── Templates ────────────────────────────────────────────────────────────────
export async function saveTemplate(template: Omit<MessageTemplate, 'id' | 'createdAt' | 'useCount'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO message_templates (name, category, subject, body, placeholders, use_count, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [template.name, template.category, template.subject ?? null, template.body, template.placeholders ? JSON.stringify(template.placeholders) : null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getTemplates(category?: string): Promise<MessageTemplate[]> {
  const db = await getDB();
  const rows = category
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM message_templates WHERE category = ? ORDER BY use_count DESC`, [category])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM message_templates ORDER BY use_count DESC`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    subject: r.subject ?? undefined,
    body: r.body,
    placeholders: r.placeholders ? JSON.parse(r.placeholders) : undefined,
    useCount: r.use_count,
    createdAt: r.created_at,
  }));
}

export function applyTemplate(template: MessageTemplate, values: Record<string, string>): string {
  let body = template.body;
  for (const [key, value] of Object.entries(values)) {
    body = body.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
  }
  return body;
}

// ─── AI message generation ────────────────────────────────────────────────────
export async function generateMessage(params: {
  to: string;
  purpose: string;
  context?: string;
  channel: MessageChannel;
  tone: MessageTone;
  settings: Settings;
}): Promise<{ subject?: string; body: string }> {
  const channelGuidance: Record<MessageChannel, string> = {
    email: 'Write a complete email with subject line.',
    whatsapp: 'Write a WhatsApp message (conversational, no formal greeting needed, use line breaks).',
    sms: 'Write an SMS (under 160 chars, very concise).',
    linkedin: 'Write a LinkedIn message (professional, personal, reference their work).',
    slack: 'Write a Slack message (concise, use bold for emphasis, casual but professional).',
  };

  const toneGuidance: Record<MessageTone, string> = {
    professional: 'Professional and courteous.',
    friendly: 'Warm and friendly, like talking to a colleague you know well.',
    formal: 'Very formal and respectful.',
    casual: 'Casual and relaxed.',
    urgent: 'Direct and urgent, but still respectful.',
    empathetic: 'Empathetic and understanding, showing you care.',
  };

  const prompt = `Write a ${params.tone} message to ${params.to} via ${params.channel}.
Purpose: ${params.purpose}
${params.context ? `Context: ${params.context}` : ''}

${channelGuidance[params.channel]}
Tone: ${toneGuidance[params.tone]}
${params.channel === 'email' ? 'Format: Subject: [line]\n\n[body]' : ''}

Write the message only, no explanation.`;

  const { response } = await routeToAI(prompt, [], params.settings);

  if (params.channel === 'email') {
    const subjectMatch = response.match(/^Subject:\s*(.+)/m);
    const bodyAfterSubject = response.replace(/^Subject:.+\n\n?/m, '').trim();
    return {
      subject: subjectMatch?.[1]?.trim(),
      body: bodyAfterSubject || response,
    };
  }

  return { body: response };
}

export async function improveMessage(text: string, goal: string, settings: Settings): Promise<string> {
  const prompt = `Improve this message for: ${goal}

Original: "${text}"

Return only the improved message, no explanation.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function translateMessage(text: string, targetLang: 'he' | 'en' | 'ar', settings: Settings): Promise<string> {
  const langNames = { he: 'Hebrew', en: 'English', ar: 'Arabic' };
  const prompt = `Translate this message to ${langNames[targetLang]}. Keep the same tone and style:

"${text}"`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function detectMessageTone(text: string, settings: Settings): Promise<{
  tone: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  suggestions: string[];
}> {
  const prompt = `Analyze the tone of this message: "${text.slice(0, 500)}"
Respond with JSON: {"tone": "description", "sentiment": "positive|negative|neutral", "suggestions": ["improvement1", "improvement2"]}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { tone: 'neutral', sentiment: 'neutral', suggestions: [] };
}
