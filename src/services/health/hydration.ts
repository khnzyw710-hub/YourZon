import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS hydration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_ml INTEGER NOT NULL,
    drink_type TEXT DEFAULT 'water',
    date TEXT NOT NULL,
    logged_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS hydration_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_target_ml INTEGER NOT NULL DEFAULT 2500,
    set_at INTEGER NOT NULL
  )`);
  return _db;
}

export type DrinkType = 'water' | 'coffee' | 'tea' | 'juice' | 'soda' | 'sports_drink' | 'alcohol' | 'other';

export const DRINK_HYDRATION_FACTOR: Record<DrinkType, number> = {
  water: 1.0,
  tea: 0.95,
  coffee: 0.80,
  juice: 0.85,
  sports_drink: 0.90,
  soda: 0.70,
  alcohol: 0.50,
  other: 0.85,
};

export const DRINK_SIZES_ML: Record<string, number> = {
  sip: 50,
  small_glass: 200,
  glass: 250,
  large_glass: 350,
  bottle: 500,
  large_bottle: 750,
  liter: 1000,
  coffee_cup: 120,
  espresso: 30,
};

export async function logHydration(amountMl: number, drinkType: DrinkType = 'water'): Promise<void> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  await db.runAsync(
    `INSERT INTO hydration_log (amount_ml, drink_type, date, logged_at) VALUES (?, ?, ?, ?)`,
    [amountMl, drinkType, today, Date.now()]
  );
}

export async function getTodayHydration(): Promise<{
  totalMl: number;
  effectiveMl: number;
  goalMl: number;
  progressPct: number;
  byDrinkType: Record<string, number>;
  logsCount: number;
}> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);

  const [rows, goalRow] = await Promise.all([
    db.getAllAsync<Record<string, any>>(`SELECT * FROM hydration_log WHERE date = ?`, [today]),
    db.getFirstAsync<{ daily_target_ml: number }>(`SELECT daily_target_ml FROM hydration_goals ORDER BY set_at DESC LIMIT 1`),
  ]);

  const goalMl = goalRow?.daily_target_ml ?? 2500;
  const totalMl = rows.reduce((s, r) => s + r.amount_ml, 0);
  const effectiveMl = rows.reduce((s, r) => s + r.amount_ml * (DRINK_HYDRATION_FACTOR[r.drink_type as DrinkType] ?? 0.85), 0);

  const byDrinkType: Record<string, number> = {};
  for (const row of rows) {
    byDrinkType[row.drink_type] = (byDrinkType[row.drink_type] ?? 0) + row.amount_ml;
  }

  return {
    totalMl: Math.round(totalMl),
    effectiveMl: Math.round(effectiveMl),
    goalMl,
    progressPct: goalMl > 0 ? Math.min(100, Math.round((effectiveMl / goalMl) * 100)) : 0,
    byDrinkType,
    logsCount: rows.length,
  };
}

export async function setHydrationGoal(dailyMl: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`INSERT INTO hydration_goals (daily_target_ml, set_at) VALUES (?, ?)`, [dailyMl, Date.now()]);
}

export async function getHydrationStreak(): Promise<number> {
  const db = await getDB();
  const goalRow = await db.getFirstAsync<{ daily_target_ml: number }>(
    `SELECT daily_target_ml FROM hydration_goals ORDER BY set_at DESC LIMIT 1`
  );
  const goalMl = goalRow?.daily_target_ml ?? 2500;

  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT date, SUM(amount_ml * CASE drink_type WHEN 'water' THEN 1.0 WHEN 'tea' THEN 0.95 WHEN 'coffee' THEN 0.8 ELSE 0.85 END) as effective FROM hydration_log GROUP BY date ORDER BY date DESC LIMIT 30`
  );

  let streak = 0;
  let d = new Date();
  for (const row of rows) {
    const expected = d.toISOString().slice(0, 10);
    if (row.date === expected && row.effective >= goalMl) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (row.date < expected) break;
  }
  return streak;
}

export async function parseHydrationFromVoice(transcript: string, settings: Settings): Promise<{
  amountMl: number;
  drinkType: DrinkType;
} | null> {
  // Fast local matching
  const lower = transcript.toLowerCase();
  let amountMl = 0;
  let drinkType: DrinkType = 'water';

  for (const [sizeName, ml] of Object.entries(DRINK_SIZES_ML)) {
    if (lower.includes(sizeName.replace('_', ' '))) {
      amountMl = ml;
      break;
    }
  }

  const numMatch = lower.match(/(\d+)\s*(ml|milliliter|ליטר|מ"ל)/i);
  if (numMatch) amountMl = parseInt(numMatch[1]) * (numMatch[2].includes('ל') ? 1000 : 1);

  if (lower.includes('קפה') || lower.includes('coffee')) drinkType = 'coffee';
  else if (lower.includes('תה') || lower.includes('tea')) drinkType = 'tea';
  else if (lower.includes('מיץ') || lower.includes('juice')) drinkType = 'juice';
  else if (lower.includes('ספורט')) drinkType = 'sports_drink';

  if (amountMl === 0) {
    const prompt = `Extract hydration info from: "${transcript}"
Respond with JSON: {"amountMl": number, "drinkType": "water|coffee|tea|juice|soda|sports_drink|other"}
Default to water and 250ml if unclear.`;
    try {
      const { response } = await routeToAI(prompt, [], settings);
      const match = response.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    amountMl = 250;
  }

  return { amountMl, drinkType };
}

export async function getHydrationTip(settings: Settings): Promise<string> {
  const today = await getTodayHydration();
  const remaining = Math.max(0, today.goalMl - today.effectiveMl);

  const prompt = `Hydration coaching:
Progress today: ${today.effectiveMl}ml of ${today.goalMl}ml goal (${today.progressPct}%)
Remaining: ${remaining}ml

Give one specific, actionable tip to help reach today's goal. Under 2 sentences.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
