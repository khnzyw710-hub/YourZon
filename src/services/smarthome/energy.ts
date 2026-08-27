import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_smarthome.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS energy_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER,
    device_name TEXT,
    kwh REAL NOT NULL,
    cost_ils REAL,
    reading_date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS energy_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monthly_kwh_limit REAL,
    monthly_cost_limit_ils REAL,
    updated_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EnergyReading {
  id?: number;
  deviceId?: number;
  deviceName?: string;
  kwh: number;
  costIls?: number;
  readingDate: string;
  createdAt: number;
}

// Israel Electric Corp tariff (residential, approx 2024)
const IEC_RATE_PER_KWH = 0.6; // ILS per kWh (approximate)

// ─── Log energy ───────────────────────────────────────────────────────────────
export async function logEnergyReading(reading: EnergyReading): Promise<void> {
  const db = await getDB();
  const cost = reading.costIls ?? reading.kwh * IEC_RATE_PER_KWH;
  await db.runAsync(
    `INSERT INTO energy_readings (device_id, device_name, kwh, cost_ils, reading_date, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [reading.deviceId ?? null, reading.deviceName ?? null, reading.kwh, cost, reading.readingDate, reading.createdAt]
  );
}

export async function getEnergyHistory(days = 30): Promise<EnergyReading[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM energy_readings WHERE reading_date >= ? ORDER BY reading_date DESC`, [since]
  );
  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id ?? undefined,
    deviceName: r.device_name ?? undefined,
    kwh: r.kwh,
    costIls: r.cost_ils,
    readingDate: r.reading_date,
    createdAt: r.created_at,
  }));
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getEnergyStats(month?: string): Promise<{
  totalKwh: number;
  totalCostIls: number;
  avgDailyKwh: number;
  projectedMonthlyKwh: number;
  projectedMonthlyCostIls: number;
  topConsumers: Array<{ name: string; kwh: number }>;
}> {
  const db = await getDB();
  const m = month ?? new Date().toISOString().slice(0, 7);
  const rows = await db.getAllAsync<{ device_name: string | null; kwh: number; cost_ils: number; reading_date: string }>(
    `SELECT device_name, kwh, cost_ils, reading_date FROM energy_readings WHERE reading_date LIKE ? ORDER BY reading_date`,
    [`${m}%`]
  );

  if (rows.length === 0) {
    return { totalKwh: 0, totalCostIls: 0, avgDailyKwh: 0, projectedMonthlyKwh: 0, projectedMonthlyCostIls: 0, topConsumers: [] };
  }

  const totalKwh = rows.reduce((s, r) => s + r.kwh, 0);
  const totalCostIls = rows.reduce((s, r) => s + (r.cost_ils ?? 0), 0);

  const uniqueDays = new Set(rows.map((r) => r.reading_date)).size;
  const avgDailyKwh = uniqueDays > 0 ? totalKwh / uniqueDays : 0;
  const projectedMonthlyKwh = avgDailyKwh * 30;
  const projectedMonthlyCostIls = projectedMonthlyKwh * IEC_RATE_PER_KWH;

  const deviceConsumption: Record<string, number> = {};
  for (const r of rows) {
    const name = r.device_name ?? 'General';
    deviceConsumption[name] = (deviceConsumption[name] ?? 0) + r.kwh;
  }
  const topConsumers = Object.entries(deviceConsumption)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, kwh]) => ({ name, kwh }));

  return { totalKwh, totalCostIls, avgDailyKwh, projectedMonthlyKwh, projectedMonthlyCostIls, topConsumers };
}

// ─── AI energy advisor ────────────────────────────────────────────────────────
export async function getEnergySavingTips(settings: Settings): Promise<string> {
  const stats = await getEnergyStats();
  const prompt = `Smart home energy advisor. Based on usage:
Monthly consumption: ${stats.totalKwh.toFixed(1)} kWh (projected ${stats.projectedMonthlyKwh.toFixed(0)} kWh)
Monthly cost: ₪${stats.totalCostIls.toFixed(0)} (projected ₪${stats.projectedMonthlyCostIls.toFixed(0)})
Top consumers: ${stats.topConsumers.map((c) => `${c.name}: ${c.kwh.toFixed(1)}kWh`).join(', ')}

Give 3 specific, actionable tips to reduce consumption (1 sentence each).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function estimateDeviceCost(deviceName: string, wattsRating: number, hoursPerDay: number): Promise<{
  dailyKwh: number;
  monthlyCostIls: number;
  yearlyCostIls: number;
}> {
  const dailyKwh = (wattsRating * hoursPerDay) / 1000;
  const monthlyCostIls = dailyKwh * 30 * IEC_RATE_PER_KWH;
  const yearlyCostIls = dailyKwh * 365 * IEC_RATE_PER_KWH;
  return { dailyKwh, monthlyCostIls, yearlyCostIls };
}
