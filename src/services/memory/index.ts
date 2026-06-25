import * as SQLite from 'expo-sqlite';
import {
  cosineSimilarity,
  bm25Score,
  generateEmbedding,
  serializeEmbedding,
  deserializeEmbedding,
} from './embeddings';

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
      embedding TEXT,
      importance INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS embeddings_meta (
      id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      dims INTEGER NOT NULL
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
  similarity?: number;
}

// ─── Keyword extraction ───────────────────────────────────────────────────────
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

// ─── API key cache for embeddings ─────────────────────────────────────────────
let _apiKeys: { openai: string; gemini: string } = { openai: '', gemini: '' };
export function setEmbeddingApiKeys(keys: { openai: string; gemini: string }) {
  _apiKeys = keys;
}

// ─── Save a fact (with embedding if keys available) ───────────────────────────
export async function saveFact(content: string, importance = 1): Promise<void> {
  const db = await getDB();
  const keywords = extractKeywords(content);
  const now = Date.now();

  // Generate embedding asynchronously (fire and forget if it fails)
  let embeddingStr: string | null = null;
  try {
    const vec = await generateEmbedding(content, _apiKeys);
    if (vec) embeddingStr = serializeEmbedding(vec);
  } catch {}

  await db.runAsync(
    'INSERT INTO facts (content, keywords, embedding, importance, created_at, accessed_at) VALUES (?, ?, ?, ?, ?, ?)',
    [content, JSON.stringify(keywords), embeddingStr, importance, now, now]
  );
}

// ─── Recall facts using semantic + BM25 hybrid scoring ───────────────────────
export async function recallFacts(query: string, limit = 6): Promise<MemoryFact[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM facts ORDER BY importance DESC, accessed_at DESC LIMIT 300'
  );
  if (rows.length === 0) return [];

  // Try to get query embedding for semantic search
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(query, _apiKeys);
  } catch {}

  const queryKeywords = extractKeywords(query);

  const scored = rows.map((row: any) => {
    const factKeywords: string[] = JSON.parse(row.keywords ?? '[]');
    const factEmbedding = deserializeEmbedding(row.embedding);

    let score = 0;

    if (queryEmbedding && factEmbedding) {
      // Semantic similarity is primary signal when available
      score = cosineSimilarity(queryEmbedding, factEmbedding) * 10;
    } else {
      // BM25 fallback
      score = bm25Score(query, row.content) * 0.5;
      // Keyword overlap bonus
      const overlap = queryKeywords.filter((k) => factKeywords.includes(k)).length;
      score += overlap;
    }

    return { ...row, score: score + row.importance * 0.1 };
  });

  const top = scored
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

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
    similarity: parseFloat(r.score.toFixed(3)),
  }));
}

export async function buildMemoryContext(query: string): Promise<string> {
  const facts = await recallFacts(query);
  if (facts.length === 0) return '';
  return facts.map((f) => `- ${f.content}`).join('\n');
}

export async function learnFromExchange(userMsg: string, _assistantMsg: string): Promise<void> {
  if (isFactWorthy(userMsg)) {
    await saveFact(userMsg.slice(0, 200), 2);
  }
}

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
