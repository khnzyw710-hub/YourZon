import * as SQLite from 'expo-sqlite';
import { getSecureKeys } from '@/services/ai/router';

// ─── DB setup ─────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_ai_cache.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS ai_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    provider TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    hit_count INTEGER DEFAULT 0
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS token_budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    provider TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    UNIQUE(date, provider)
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_cache_key ON ai_cache(key)`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_cache_expires ON ai_cache(expires_at)`);
  return _db;
}

// ─── Cache key ────────────────────────────────────────────────────────────────
function hashQuery(query: string): string {
  // Simple djb2 hash for quick lookup key
  let h = 5381;
  for (let i = 0; i < query.length; i++) {
    h = ((h << 5) + h) + query.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(36) + '_' + query.length;
}

// ─── Semantic similarity (cosine) ────────────────────────────────────────────
function tokenize(text: string): Map<string, number> {
  const words = text.toLowerCase().split(/\s+/);
  const freq = new Map<string, number>();
  for (const w of words) {
    const cleaned = w.replace(/[^\w֐-׿]/g, '');
    if (cleaned.length > 1) freq.set(cleaned, (freq.get(cleaned) ?? 0) + 1);
  }
  return freq;
}

function cosineSimilarity(a: string, b: string): number {
  const fa = tokenize(a);
  const fb = tokenize(b);
  let dot = 0, normA = 0, normB = 0;
  for (const [word, countA] of fa) {
    const countB = fb.get(word) ?? 0;
    dot += countA * countB;
    normA += countA * countA;
  }
  for (const [, countB] of fb) {
    normB += countB * countB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Cache operations ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SIMILARITY_THRESHOLD = 0.85;

export interface CacheEntry {
  response: string;
  provider: string;
  tokensUsed: number;
}

export async function getCached(query: string): Promise<CacheEntry | null> {
  try {
    const db = await getDB();
    const now = Date.now();
    const key = hashQuery(query);

    // Exact match first
    const exact = await db.getFirstAsync<{ response: string; provider: string; tokens_used: number }>(
      `SELECT response, provider, tokens_used FROM ai_cache WHERE key = ? AND expires_at > ?`,
      [key, now]
    );
    if (exact) {
      await db.runAsync(`UPDATE ai_cache SET hit_count = hit_count + 1 WHERE key = ?`, [key]);
      return { response: exact.response, provider: exact.provider, tokensUsed: exact.tokens_used };
    }

    // Semantic similarity check (sample recent non-expired entries)
    const recent = await db.getAllAsync<{ key: string; query: string; response: string; provider: string; tokens_used: number }>(
      `SELECT key, query, response, provider, tokens_used FROM ai_cache WHERE expires_at > ? ORDER BY created_at DESC LIMIT 200`,
      [now]
    );
    for (const row of recent) {
      const sim = cosineSimilarity(query, row.query);
      if (sim >= SIMILARITY_THRESHOLD) {
        await db.runAsync(`UPDATE ai_cache SET hit_count = hit_count + 1 WHERE key = ?`, [row.key]);
        return { response: row.response, provider: row.provider, tokensUsed: row.tokens_used };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function setCached(query: string, response: string, provider: string, tokensUsed: number): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    const key = hashQuery(query);
    await db.runAsync(
      `INSERT OR REPLACE INTO ai_cache (key, query, response, provider, tokens_used, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [key, query, response, provider, tokensUsed, now, now + CACHE_TTL_MS]
    );
    // Prune expired entries
    await db.runAsync(`DELETE FROM ai_cache WHERE expires_at < ?`, [now - CACHE_TTL_MS]);
  } catch {}
}

export async function clearCache(): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM ai_cache`);
}

export async function getCacheStats(): Promise<{ entries: number; hitRate: number; totalHits: number }> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ entries: number; total_hits: number }>(
    `SELECT COUNT(*) as entries, SUM(hit_count) as total_hits FROM ai_cache WHERE expires_at > ?`,
    [Date.now()]
  );
  return {
    entries: row?.entries ?? 0,
    totalHits: row?.total_hits ?? 0,
    hitRate: (row?.entries ?? 0) > 0 ? (row?.total_hits ?? 0) / (row?.entries ?? 1) : 0,
  };
}

// ─── Token budget tracking ────────────────────────────────────────────────────
const TOKEN_COSTS: Record<string, number> = {
  claude: 0.000003,
  openai: 0.000002,
  gemini: 0.0000001,
  grok: 0.000002,
};

export async function recordTokenUsage(provider: string, tokens: number): Promise<void> {
  try {
    const db = await getDB();
    const date = new Date().toISOString().slice(0, 10);
    const cost = tokens * (TOKEN_COSTS[provider] ?? 0.000002);
    await db.runAsync(
      `INSERT INTO token_budget (date, provider, tokens_used, cost_usd)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date, provider) DO UPDATE SET
         tokens_used = tokens_used + excluded.tokens_used,
         cost_usd = cost_usd + excluded.cost_usd`,
      [date, provider, tokens, cost]
    );
  } catch {}
}

export async function getTokenBudget(days = 7): Promise<{
  provider: string; tokens: number; cost: number; date: string;
}[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return db.getAllAsync<{ provider: string; tokens: number; cost: number; date: string }>(
    `SELECT provider, SUM(tokens_used) as tokens, SUM(cost_usd) as cost, date
     FROM token_budget WHERE date >= ? GROUP BY date, provider ORDER BY date DESC`,
    [since]
  );
}

export async function getDailyBudgetSummary(): Promise<{ total_tokens: number; total_cost: number; by_provider: Record<string, number> }> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{ provider: string; tokens_used: number; cost_usd: number }>(
    `SELECT provider, tokens_used, cost_usd FROM token_budget WHERE date = ?`,
    [today]
  );
  const by_provider: Record<string, number> = {};
  let total_tokens = 0, total_cost = 0;
  for (const r of rows) {
    by_provider[r.provider] = r.tokens_used;
    total_tokens += r.tokens_used;
    total_cost += r.cost_usd;
  }
  return { total_tokens, total_cost, by_provider };
}

// ─── GPT-4o-mini routing (simple queries ≤30 words) ─────────────────────────
export function isSimpleQuery(query: string): boolean {
  const words = query.trim().split(/\s+/).length;
  if (words > 30) return false;
  const complexPatterns = [
    /code|implement|build|create|generate|write.*function/i,
    /analyze|compare|explain in detail|step by step/i,
    /translate.*to|convert.*from/i,
  ];
  return !complexPatterns.some((p) => p.test(query));
}

export function getOptimalModelForQuery(query: string, currentProvider: string): string {
  if (currentProvider === 'openai' && isSimpleQuery(query)) {
    return 'gpt-4o-mini';
  }
  return currentProvider;
}

// ─── Local Ollama stub ────────────────────────────────────────────────────────
export async function queryOllamaLocal(prompt: string, model = 'llama3.2'): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`http://localhost:11434/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { response?: string };
    return data.response ?? null;
  } catch {
    return null;
  }
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
