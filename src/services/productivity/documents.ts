import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'note',
    tags TEXT,
    pinned INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updated_at)`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocumentType = 'note' | 'draft' | 'template' | 'summary' | 'report' | 'idea';

export interface Document {
  id?: number;
  title: string;
  content: string;
  type: DocumentType;
  tags?: string[];
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function saveDocument(doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO documents (title, content, type, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [doc.title, doc.content, doc.type, doc.tags ? JSON.stringify(doc.tags) : null, doc.pinned ? 1 : 0, now, now]
  );
  return result.lastInsertRowId;
}

export async function updateDocument(id: number, updates: Partial<Pick<Document, 'title' | 'content' | 'tags' | 'pinned'>>): Promise<void> {
  const db = await getDB();
  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
  if (updates.content !== undefined) { sets.push('content = ?'); values.push(updates.content); }
  if (updates.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.pinned !== undefined) { sets.push('pinned = ?'); values.push(updates.pinned ? 1 : 0); }

  values.push(id);
  await db.runAsync(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function deleteDocument(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM documents WHERE id = ?`, [id]);
}

export async function getDocuments(type?: DocumentType, limit = 50): Promise<Document[]> {
  const db = await getDB();
  const rows = type
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM documents WHERE type = ? ORDER BY pinned DESC, updated_at DESC LIMIT ?`, [type, limit])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM documents ORDER BY pinned DESC, updated_at DESC LIMIT ?`, [limit]);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type as DocumentType,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function searchDocuments(query: string): Promise<Document[]> {
  const db = await getDB();
  const q = `%${query}%`;
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM documents WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 30`,
    [q, q]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type as DocumentType,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ─── AI document features ─────────────────────────────────────────────────────
export async function summarizeDocument(content: string, settings: Settings): Promise<string> {
  const prompt = `Summarize this document in 3 bullet points (key takeaways only):

${content.slice(0, 4000)}`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function improveWriting(text: string, goal: 'clarity' | 'professional' | 'concise' | 'persuasive', settings: Settings): Promise<string> {
  const goalDescriptions = {
    clarity: 'Make this clearer and easier to understand. Fix confusing sentences.',
    professional: 'Make this more professional and formal. Polish the tone.',
    concise: 'Make this shorter by 30% without losing key information.',
    persuasive: 'Make this more persuasive and compelling. Strengthen the arguments.',
  };

  const prompt = `${goalDescriptions[goal]}

Original text:
${text.slice(0, 3000)}

Provide the improved version only, no explanation.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateOutline(topic: string, documentType: string, settings: Settings): Promise<string> {
  const prompt = `Create a detailed outline for a ${documentType} about: "${topic}"

Include sections, subsections, and key points for each. Be specific and practical.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function extractKeyPoints(text: string, settings: Settings): Promise<string[]> {
  const prompt = `Extract the 5-7 most important points from this text:

${text.slice(0, 3000)}

List only the key points, one per line. No numbering or bullets.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 5)
    .slice(0, 7);
}

export async function translateDocument(text: string, targetLanguage: 'he' | 'en' | 'ar', settings: Settings): Promise<string> {
  const langNames = { he: 'Hebrew', en: 'English', ar: 'Arabic' };
  const prompt = `Translate the following to ${langNames[targetLanguage]}. Maintain the original formatting and tone:

${text.slice(0, 3000)}`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function generateTemplate(type: string, context: string, settings: Settings): Promise<string> {
  const prompt = `Create a professional ${type} template for: ${context}

Include placeholder text in [brackets]. Make it practical and ready to use.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function voiceDictateToDocument(transcript: string, existingContent: string, settings: Settings): Promise<string> {
  if (!existingContent) {
    return transcript;
  }

  const prompt = `The user is dictating additional content for a document. Seamlessly integrate the new content:

Existing document:
${existingContent.slice(0, 2000)}

New dictated content: "${transcript}"

Return the complete updated document. Maintain the existing style and format.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
