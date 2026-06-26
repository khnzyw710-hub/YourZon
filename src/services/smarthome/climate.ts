import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_smarthome.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS climate_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone TEXT NOT NULL,
    target_temp_c REAL NOT NULL,
    mode TEXT NOT NULL,
    fan_speed TEXT DEFAULT 'auto',
    schedule TEXT,
    active INTEGER DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS climate_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone TEXT NOT NULL,
    temperature_c REAL NOT NULL,
    humidity_pct REAL,
    co2_ppm INTEGER,
    recorded_at INTEGER NOT NULL
  )`);
  return _db;
}

export type ClimateMode = 'cool' | 'heat' | 'auto' | 'fan_only' | 'dry' | 'off';
export type FanSpeed = 'auto' | 'low' | 'medium' | 'high' | 'turbo';

export interface ClimateZone {
  zone: string;
  targetTempC: number;
  mode: ClimateMode;
  fanSpeed: FanSpeed;
  schedule?: Array<{ time: string; mode: ClimateMode; temp: number }>;
  active: boolean;
}

export interface ClimateReading {
  zone: string;
  temperatureC: number;
  humidityPct?: number;
  co2Ppm?: number;
  recordedAt: number;
}

export async function setClimateZone(zone: ClimateZone): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO climate_settings (zone, target_temp_c, mode, fan_speed, schedule, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [zone.zone, zone.targetTempC, zone.mode, zone.fanSpeed, zone.schedule ? JSON.stringify(zone.schedule) : null, zone.active ? 1 : 0, Date.now()]
  );
}

export async function getClimateZones(): Promise<ClimateZone[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM climate_settings WHERE active = 1 ORDER BY zone`);
  return rows.map((r) => ({
    zone: r.zone,
    targetTempC: r.target_temp_c,
    mode: r.mode as ClimateMode,
    fanSpeed: r.fan_speed as FanSpeed,
    schedule: r.schedule ? JSON.parse(r.schedule) : undefined,
    active: Boolean(r.active),
  }));
}

export async function logClimateReading(reading: ClimateReading): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO climate_readings (zone, temperature_c, humidity_pct, co2_ppm, recorded_at) VALUES (?, ?, ?, ?, ?)`,
    [reading.zone, reading.temperatureC, reading.humidityPct ?? null, reading.co2Ppm ?? null, reading.recordedAt]
  );
}

export async function getComfortScore(zone: string): Promise<{
  score: number;
  assessment: string;
  recommendation?: string;
}> {
  const db = await getDB();
  const latest = await db.getFirstAsync<Record<string, any>>(
    `SELECT * FROM climate_readings WHERE zone = ? ORDER BY recorded_at DESC LIMIT 1`,
    [zone]
  );

  if (!latest) return { score: 50, assessment: 'No data available' };

  const temp = latest.temperature_c;
  const humidity = latest.humidity_pct ?? 50;
  const co2 = latest.co2_ppm ?? 800;

  // Comfort scoring based on ASHRAE 55 guidelines
  const tempScore = temp >= 20 && temp <= 25 ? 100 : temp >= 18 && temp <= 27 ? 70 : 30;
  const humidityScore = humidity >= 30 && humidity <= 60 ? 100 : humidity >= 20 && humidity <= 70 ? 60 : 20;
  const co2Score = co2 < 800 ? 100 : co2 < 1000 ? 80 : co2 < 1500 ? 50 : 20;

  const score = Math.round((tempScore * 0.5 + humidityScore * 0.3 + co2Score * 0.2));

  let assessment = score >= 80 ? 'Comfortable' : score >= 60 ? 'Acceptable' : 'Uncomfortable';
  let recommendation: string | undefined;

  if (temp > 25) recommendation = `Cool to 22-24°C for optimal comfort`;
  else if (temp < 20) recommendation = `Heat to 21-23°C`;
  else if (humidity > 60) recommendation = `Run dehumidifier — humidity ${humidity}% is too high`;
  else if (co2 > 1000) recommendation = `Open a window — CO₂ at ${co2}ppm, above recommended 1000ppm`;

  return { score, assessment, recommendation };
}

export async function generateClimateSchedule(
  preferences: string,
  occupancySchedule: string,
  settings: Settings
): Promise<Array<{ time: string; mode: ClimateMode; tempC: number; reason: string }>> {
  const prompt = `Design an optimal AC/heating schedule for Israel climate:
User preferences: ${preferences}
Occupancy: ${occupancySchedule}

Create a daily schedule that balances comfort, energy savings (IEC rate ₪0.6/kWh), and health.

Respond with JSON array:
[{"time": "HH:MM", "mode": "cool|heat|fan_only|off", "tempC": number, "reason": "brief reason"}]

Include transitions for waking up, arriving home, sleeping.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [
    { time: '07:00', mode: 'cool', tempC: 24, reason: 'Morning comfort' },
    { time: '09:00', mode: 'fan_only', tempC: 24, reason: 'Light cooling' },
    { time: '18:00', mode: 'cool', tempC: 23, reason: 'Evening arrival' },
    { time: '23:00', mode: 'cool', tempC: 22, reason: 'Sleep temperature' },
  ];
}

export async function parseVoiceClimateCommand(transcript: string, settings: Settings): Promise<{
  zone?: string;
  mode?: ClimateMode;
  tempC?: number;
  fanSpeed?: FanSpeed;
} | null> {
  const lower = transcript.toLowerCase();

  // Fast parsing
  const tempMatch = lower.match(/(\d+)\s*(?:degrees?|מעלות|°)/);
  const tempC = tempMatch ? parseInt(tempMatch[1]) : undefined;

  const mode: ClimateMode | undefined =
    lower.includes('cool') || lower.includes('קר') || lower.includes('מיזוג') ? 'cool' :
    lower.includes('heat') || lower.includes('חם') ? 'heat' :
    lower.includes('fan') || lower.includes('מאוורר') ? 'fan_only' :
    lower.includes('off') || lower.includes('כבה') ? 'off' :
    undefined;

  if (tempC || mode) return { tempC, mode };

  const prompt = `Parse climate control command: "${transcript}"
Respond with JSON or null:
{"zone": "room or null", "mode": "cool|heat|fan_only|auto|off or null", "tempC": number or null, "fanSpeed": "auto|low|medium|high or null"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}
