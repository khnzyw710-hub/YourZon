import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS biometrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL,
    height_cm REAL,
    body_fat_pct REAL,
    muscle_mass_kg REAL,
    heart_rate_resting INTEGER,
    blood_pressure_systolic INTEGER,
    blood_pressure_diastolic INTEGER,
    blood_oxygen_pct REAL,
    temperature_c REAL,
    steps INTEGER,
    active_min INTEGER,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BiometricEntry {
  id?: number;
  date: string;
  weightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  heartRateResting?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodOxygenPct?: number;
  temperatureC?: number;
  steps?: number;
  activeMin?: number;
  createdAt: number;
}

// ─── Log biometrics ───────────────────────────────────────────────────────────
export async function logBiometrics(entry: BiometricEntry): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO biometrics (date, weight_kg, height_cm, body_fat_pct, muscle_mass_kg, heart_rate_resting, blood_pressure_systolic, blood_pressure_diastolic, blood_oxygen_pct, temperature_c, steps, active_min, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.weightKg ?? null,
      entry.heightCm ?? null,
      entry.bodyFatPct ?? null,
      entry.muscleMassKg ?? null,
      entry.heartRateResting ?? null,
      entry.bloodPressureSystolic ?? null,
      entry.bloodPressureDiastolic ?? null,
      entry.bloodOxygenPct ?? null,
      entry.temperatureC ?? null,
      entry.steps ?? null,
      entry.activeMin ?? null,
      entry.createdAt,
    ]
  );
}

// ─── Get history ──────────────────────────────────────────────────────────────
export async function getBiometricHistory(days = 90): Promise<BiometricEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM biometrics WHERE date >= ? ORDER BY date DESC`, [since]
  );

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    weightKg: r.weight_kg ?? undefined,
    heightCm: r.height_cm ?? undefined,
    bodyFatPct: r.body_fat_pct ?? undefined,
    muscleMassKg: r.muscle_mass_kg ?? undefined,
    heartRateResting: r.heart_rate_resting ?? undefined,
    bloodPressureSystolic: r.blood_pressure_systolic ?? undefined,
    bloodPressureDiastolic: r.blood_pressure_diastolic ?? undefined,
    bloodOxygenPct: r.blood_oxygen_pct ?? undefined,
    temperatureC: r.temperature_c ?? undefined,
    steps: r.steps ?? undefined,
    activeMin: r.active_min ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getLatestBiometrics(): Promise<BiometricEntry | null> {
  const history = await getBiometricHistory(30);
  return history[0] ?? null;
}

// ─── BMI calculation ──────────────────────────────────────────────────────────
export function calculateBMI(weightKg: number, heightCm: number): {
  bmi: number;
  category: string;
} {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  let category = 'Normal';
  if (bmi < 18.5) category = 'Underweight';
  else if (bmi < 25) category = 'Normal';
  else if (bmi < 30) category = 'Overweight';
  else category = 'Obese';

  return { bmi: Math.round(bmi * 10) / 10, category };
}

// ─── Weight trend ─────────────────────────────────────────────────────────────
export async function getWeightTrend(days = 30): Promise<{
  current: number | null;
  change: number;
  trend: 'gaining' | 'losing' | 'stable';
  data: Array<{ date: string; weight: number }>;
}> {
  const history = await getBiometricHistory(days);
  const withWeight = history.filter((h) => h.weightKg != null);

  if (withWeight.length === 0) return { current: null, change: 0, trend: 'stable', data: [] };

  const current = withWeight[0].weightKg!;
  const oldest = withWeight[withWeight.length - 1].weightKg!;
  const change = Math.round((current - oldest) * 10) / 10;
  const trend: 'gaining' | 'losing' | 'stable' =
    change > 0.5 ? 'gaining' : change < -0.5 ? 'losing' : 'stable';

  const data = withWeight.map((h) => ({ date: h.date, weight: h.weightKg! })).reverse();

  return { current, change, trend, data };
}

// ─── Steps tracking ───────────────────────────────────────────────────────────
export async function logSteps(steps: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await logBiometrics({ date: today, steps, createdAt: Date.now() });
}

export async function getTodaySteps(): Promise<number> {
  const latest = await getLatestBiometrics();
  const today = new Date().toISOString().slice(0, 10);
  if (latest?.date === today && latest.steps) return latest.steps;
  return 0;
}

// ─── Health risk assessment ───────────────────────────────────────────────────
export async function assessHealthRisk(settings: Settings): Promise<string> {
  const biometrics = await getLatestBiometrics();
  if (!biometrics) return 'No biometric data available. Log your first measurement to get started.';

  const bmiInfo = biometrics.weightKg && biometrics.heightCm
    ? calculateBMI(biometrics.weightKg, biometrics.heightCm)
    : null;

  const prompt = `Health risk assessment based on biometrics (information only, not medical advice):
${biometrics.weightKg ? `Weight: ${biometrics.weightKg}kg` : ''}
${bmiInfo ? `BMI: ${bmiInfo.bmi} (${bmiInfo.category})` : ''}
${biometrics.heartRateResting ? `Resting HR: ${biometrics.heartRateResting} bpm` : ''}
${biometrics.bloodPressureSystolic ? `BP: ${biometrics.bloodPressureSystolic}/${biometrics.bloodPressureDiastolic} mmHg` : ''}
${biometrics.steps ? `Steps today: ${biometrics.steps}` : ''}

Provide a 3-point health summary: what's good, what to watch, and one actionable recommendation.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
