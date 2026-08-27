import * as SQLite from 'expo-sqlite';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_analytics.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS query_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL,
    query_preview TEXT NOT NULL,
    provider TEXT NOT NULL,
    mode TEXT DEFAULT 'standard',
    latency_ms INTEGER DEFAULT 0,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    was_cached INTEGER DEFAULT 0,
    success INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    hour_of_day INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS daily_summary (
    date TEXT PRIMARY KEY,
    total_queries INTEGER DEFAULT 0,
    avg_latency_ms REAL DEFAULT 0,
    cache_hit_rate REAL DEFAULT 0,
    provider_distribution TEXT DEFAULT '{}'
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_ql_created ON query_log(created_at)`);
  return _db;
}

// ─── Log a query ──────────────────────────────────────────────────────────────
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

export async function logQuery(params: {
  query: string;
  provider: string;
  mode?: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  wasCached?: boolean;
  success?: boolean;
}): Promise<void> {
  try {
    const db = await getDB();
    const now = new Date();
    await db.runAsync(
      `INSERT INTO query_log (query_hash, query_preview, provider, mode, latency_ms, tokens_in, tokens_out, was_cached, success, created_at, hour_of_day, day_of_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hashStr(params.query),
        params.query.slice(0, 100),
        params.provider,
        params.mode ?? 'standard',
        params.latencyMs,
        params.tokensIn ?? 0,
        params.tokensOut ?? 0,
        params.wasCached ? 1 : 0,
        params.success !== false ? 1 : 0,
        Date.now(),
        now.getHours(),
        now.getDay(),
      ]
    );
  } catch {}
}

// ─── Usage statistics ─────────────────────────────────────────────────────────
export async function getUsageStats(days = 30): Promise<{
  totalQueries: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  successRate: number;
  topProviders: Array<{ provider: string; count: number; pct: number }>;
  peakHour: number;
  peakDay: string;
  dailyTrend: Array<{ date: string; count: number }>;
}> {
  try {
    const db = await getDB();
    const since = Date.now() - days * 86400000;

    const rows = await db.getAllAsync<{
      provider: string;
      latency_ms: number;
      was_cached: number;
      success: number;
      hour_of_day: number;
      day_of_week: number;
      created_at: number;
    }>(`SELECT provider, latency_ms, was_cached, success, hour_of_day, day_of_week, created_at
        FROM query_log WHERE created_at > ?`, [since]);

    if (rows.length === 0) {
      return {
        totalQueries: 0, avgLatencyMs: 0, cacheHitRate: 0, successRate: 0,
        topProviders: [], peakHour: 9, peakDay: 'Sunday', dailyTrend: [],
      };
    }

    const totalQueries = rows.length;
    const avgLatencyMs = Math.round(rows.reduce((s, r) => s + r.latency_ms, 0) / totalQueries);
    const cacheHitRate = rows.filter((r) => r.was_cached === 1).length / totalQueries;
    const successRate = rows.filter((r) => r.success === 1).length / totalQueries;

    const providerCounts: Record<string, number> = {};
    for (const r of rows) providerCounts[r.provider] = (providerCounts[r.provider] ?? 0) + 1;
    const topProviders = Object.entries(providerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([provider, count]) => ({ provider, count, pct: count / totalQueries }));

    const hourCounts = Array(24).fill(0);
    const dayCounts = Array(7).fill(0);
    for (const r of rows) {
      hourCounts[r.hour_of_day]++;
      dayCounts[r.day_of_week]++;
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDay = dayNames[dayCounts.indexOf(Math.max(...dayCounts))];

    // Daily trend: group by date
    const dateCounts: Record<string, number> = {};
    for (const r of rows) {
      const date = new Date(r.created_at).toISOString().slice(0, 10);
      dateCounts[date] = (dateCounts[date] ?? 0) + 1;
    }
    const dailyTrend = Object.entries(dateCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return { totalQueries, avgLatencyMs, cacheHitRate, successRate, topProviders, peakHour, peakDay, dailyTrend };
  } catch {
    return {
      totalQueries: 0, avgLatencyMs: 0, cacheHitRate: 0, successRate: 0,
      topProviders: [], peakHour: 9, peakDay: 'Sunday', dailyTrend: [],
    };
  }
}

export async function getInsights(): Promise<string[]> {
  const stats = await getUsageStats(7);
  const insights: string[] = [];

  if (stats.totalQueries === 0) return ['No usage data yet.'];

  if (stats.cacheHitRate > 0.3) {
    insights.push(`Cache is saving ${Math.round(stats.cacheHitRate * 100)}% of API calls — great efficiency.`);
  }
  if (stats.avgLatencyMs < 1000) {
    insights.push(`Average response time is fast: ${stats.avgLatencyMs}ms.`);
  } else if (stats.avgLatencyMs > 3000) {
    insights.push(`Responses are slow (${stats.avgLatencyMs}ms avg). Consider enabling cache or race mode.`);
  }
  if (stats.peakHour >= 6 && stats.peakHour <= 9) {
    insights.push(`You use ZON most in the morning — perfect for a briefing routine.`);
  }
  if (stats.topProviders[0]) {
    insights.push(`${stats.topProviders[0].provider} is your most-used AI (${Math.round(stats.topProviders[0].pct * 100)}% of queries).`);
  }
  if (stats.successRate < 0.9) {
    insights.push(`${Math.round((1 - stats.successRate) * 100)}% of queries failed — check your API keys.`);
  }

  return insights;
}

// ─── Prune old logs ───────────────────────────────────────────────────────────
export async function pruneOldLogs(keepDays = 90): Promise<void> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - keepDays * 86400000;
    await db.runAsync(`DELETE FROM query_log WHERE created_at < ?`, [cutoff]);
  } catch {}
}
