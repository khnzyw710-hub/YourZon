import * as SQLite from 'expo-sqlite';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_feedback.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    provider TEXT NOT NULL,
    rating INTEGER NOT NULL,
    thumbs TEXT,
    correction TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS provider_stats (
    provider TEXT PRIMARY KEY,
    total_queries INTEGER DEFAULT 0,
    total_rating REAL DEFAULT 0,
    thumbs_up INTEGER DEFAULT 0,
    thumbs_down INTEGER DEFAULT 0
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FeedbackEntry {
  id?: number;
  query: string;
  response: string;
  provider: string;
  rating: 1 | 2 | 3 | 4 | 5;
  thumbs?: 'up' | 'down';
  correction?: string;
  tags?: string[];
  createdAt: number;
}

export interface ProviderStats {
  provider: string;
  totalQueries: number;
  avgRating: number;
  thumbsUp: number;
  thumbsDown: number;
  satisfactionRate: number;
}

// ─── Submit feedback ──────────────────────────────────────────────────────────
export async function submitFeedback(entry: FeedbackEntry): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO feedback (query, response, provider, rating, thumbs, correction, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.query,
        entry.response,
        entry.provider,
        entry.rating,
        entry.thumbs ?? null,
        entry.correction ?? null,
        entry.tags ? JSON.stringify(entry.tags) : null,
        entry.createdAt,
      ]
    );

    // Update provider stats
    await db.runAsync(
      `INSERT INTO provider_stats (provider, total_queries, total_rating, thumbs_up, thumbs_down)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         total_queries = total_queries + 1,
         total_rating = total_rating + excluded.total_rating,
         thumbs_up = thumbs_up + excluded.thumbs_up,
         thumbs_down = thumbs_down + excluded.thumbs_down`,
      [
        entry.provider,
        entry.rating,
        entry.thumbs === 'up' ? 1 : 0,
        entry.thumbs === 'down' ? 1 : 0,
      ]
    );
  } catch {}
}

export async function quickThumbsFeedback(
  query: string,
  response: string,
  provider: string,
  thumbs: 'up' | 'down'
): Promise<void> {
  await submitFeedback({
    query,
    response,
    provider,
    rating: thumbs === 'up' ? 5 : 1,
    thumbs,
    createdAt: Date.now(),
  });
}

// ─── Get stats ────────────────────────────────────────────────────────────────
export async function getProviderStats(): Promise<ProviderStats[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{
      provider: string;
      total_queries: number;
      total_rating: number;
      thumbs_up: number;
      thumbs_down: number;
    }>(`SELECT * FROM provider_stats WHERE total_queries > 0`);

    return rows.map((r) => ({
      provider: r.provider,
      totalQueries: r.total_queries,
      avgRating: r.total_queries > 0 ? r.total_rating / r.total_queries : 0,
      thumbsUp: r.thumbs_up,
      thumbsDown: r.thumbs_down,
      satisfactionRate:
        r.thumbs_up + r.thumbs_down > 0
          ? r.thumbs_up / (r.thumbs_up + r.thumbs_down)
          : 0,
    }));
  } catch {
    return [];
  }
}

export async function getBestProvider(): Promise<string | null> {
  const stats = await getProviderStats();
  if (stats.length === 0) return null;

  // Sort by combined score: avg_rating * 0.5 + satisfaction_rate * 0.5
  const sorted = stats
    .filter((s) => s.totalQueries >= 3)
    .sort((a, b) => {
      const scoreA = (a.avgRating / 5) * 0.5 + a.satisfactionRate * 0.5;
      const scoreB = (b.avgRating / 5) * 0.5 + b.satisfactionRate * 0.5;
      return scoreB - scoreA;
    });

  return sorted[0]?.provider ?? null;
}

// ─── Corrections learning ─────────────────────────────────────────────────────
export async function getCorrections(limit = 50): Promise<Array<{ query: string; response: string; correction: string }>> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{ query: string; response: string; correction: string }>(
      `SELECT query, response, correction FROM feedback WHERE correction IS NOT NULL AND correction != '' ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function buildCorrectionContext(): Promise<string> {
  const corrections = await getCorrections(10);
  if (corrections.length === 0) return '';

  const lines = corrections.map((c) =>
    `User asked: "${c.query.slice(0, 100)}" → Wrong: "${c.response.slice(0, 80)}" → Correct: "${c.correction.slice(0, 80)}"`
  );

  return `[Learning from past corrections:\n${lines.join('\n')}\nApply these corrections to avoid repeating mistakes.]`;
}

// ─── Recent feedback summary ──────────────────────────────────────────────────
export async function getRecentFeedbackSummary(days = 7): Promise<{
  totalFeedback: number;
  avgRating: number;
  thumbsUpRate: number;
  topIssues: string[];
}> {
  try {
    const db = await getDB();
    const since = Date.now() - days * 86400000;
    const rows = await db.getAllAsync<{
      rating: number;
      thumbs: string | null;
      tags: string | null;
    }>(
      `SELECT rating, thumbs, tags FROM feedback WHERE created_at > ?`,
      [since]
    );

    if (rows.length === 0) return { totalFeedback: 0, avgRating: 0, thumbsUpRate: 0, topIssues: [] };

    const avgRating = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    const thumbsUp = rows.filter((r) => r.thumbs === 'up').length;
    const thumbsVoted = rows.filter((r) => r.thumbs != null).length;

    const tagFreq: Record<string, number> = {};
    for (const r of rows) {
      if (r.tags) {
        try {
          const tags: string[] = JSON.parse(r.tags);
          for (const t of tags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
        } catch {}
      }
    }
    const topIssues = Object.entries(tagFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);

    return {
      totalFeedback: rows.length,
      avgRating: Math.round(avgRating * 10) / 10,
      thumbsUpRate: thumbsVoted > 0 ? thumbsUp / thumbsVoted : 0,
      topIssues,
    };
  } catch {
    return { totalFeedback: 0, avgRating: 0, thumbsUpRate: 0, topIssues: [] };
  }
}
