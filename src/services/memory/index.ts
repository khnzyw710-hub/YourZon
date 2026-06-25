import * as SQLite from 'expo-sqlite';

// ─── DB setup ──────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_memory.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL,
      importance INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0
    );
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MemoryFact {
  id: number;
  content: string;
  keywords: string[];
  importance: number;
  createdAt: number;
}

// ─── Keyword extraction (lightweight, no model needed) ────────────────────────
const STOP_WORDS = new Set([
  'אני', 'אתה', 'הוא', 'היא', 'אנחנו', 'הם', 'את', 'של', 'עם',
  'על', 'אל', 'לא', 'כן', 'כי', 'אם', 'גם', 'רק', 'כבר', 'עוד',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'he',
  'she', 'we', 'they', 'it', 'to', 'of', 'and', 'or', 'but', 'in',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s֐-׿]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8);
}

// ─── Detect if a message contains a saveable fact ────────────────────────────
const FACT_PATTERNS = [
  /אני (אוהב|שונא|גר|עובד|לומד|מתעסק|יש לי|קונה|עושה)/i,
  /שמי|השם שלי|נקרא/i,
  /הכלב|החתול|הילד|האשה|הבעל|האח|האחות/i,
  /אני (בן|בת) \d+/i,
  /גר ב|גרה ב|גרים ב/i,
  /my name|i live|i work|i love|i hate|i have|i am \d+/i,
  /remember that|don't forget|note that/i,
];

export function isFactWorthy(text: string): boolean {
  return FACT_PATTERNS.some((p) => p.test(text));
}

// ─── Save a fact ──────────────────────────────────────────────────────────────
export async function saveFact(content: string, importance = 1): Promise<void> {
  const db = await getDB();
  const keywords = extractKeywords(content);
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO facts (content, keywords, importance, created_at, accessed_at) VALUES (?, ?, ?, ?, ?)',
    [content, JSON.stringify(keywords), importance, now, now]
  );
}

// ─── Retrieve relevant facts for a query ─────────────────────────────────────
export async function recallFacts(query: string, limit = 5): Promise<MemoryFact[]> {
  const db = await getDB();
  const queryKeywords = extractKeywords(query);
  if (queryKeywords.length === 0) return [];

  const rows = await db.getAllAsync<any>('SELECT * FROM facts ORDER BY importance DESC, accessed_at DESC LIMIT 200');

  // Score each fact by keyword overlap
  const scored = rows.map((row: any) => {
    const factKeywords: string[] = JSON.parse(row.keywords ?? '[]');
    const overlap = queryKeywords.filter((k) => factKeywords.includes(k)).length;
    return { ...row, score: overlap + row.importance };
  });

  const top = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Update access stats
  for (const row of top) {
    await db.runAsync(
      'UPDATE facts SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?',
      [Date.now(), row.id]
    );
  }

  return top.map((r) => ({
    id: r.id,
    content: r.content,
    keywords: JSON.parse(r.keywords ?? '[]'),
    importance: r.importance,
    createdAt: r.created_at,
  }));
}

// ─── Format memory for AI injection ──────────────────────────────────────────
export async function buildMemoryContext(query: string): Promise<string> {
  const facts = await recallFacts(query);
  if (facts.length === 0) return '';
  return facts.map((f) => `- ${f.content}`).join('\n');
}

// ─── Auto-extract and save facts from an assistant exchange ──────────────────
export async function learnFromExchange(userMsg: string, _assistantMsg: string): Promise<void> {
  if (isFactWorthy(userMsg)) {
    await saveFact(userMsg.slice(0, 200), 2);
  }
}

// ─── List all facts (for memory viewer screen) ────────────────────────────────
export async function listAllFacts(): Promise<MemoryFact[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>('SELECT * FROM facts ORDER BY importance DESC, created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    content: r.content,
    keywords: JSON.parse(r.keywords ?? '[]'),
    importance: r.importance,
    createdAt: r.created_at,
  }));
}

export async function deleteFact(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM facts WHERE id = ?', [id]);
}

export async function clearAllFacts(): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM facts');
}
