// Life Tracker — continuous GPS tracking, activity detection, calorie estimation,
// daily route log, and place intelligence. The "black box" of your physical life.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';

export const LOCATION_TASK = 'zon-life-location';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_lifetracker.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS location_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      accuracy REAL,
      speed REAL DEFAULT 0,
      altitude REAL,
      heading REAL,
      activity TEXT DEFAULT 'unknown',
      place_name TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      steps INTEGER DEFAULT 0,
      distance_m REAL DEFAULT 0,
      calories REAL DEFAULT 0,
      active_min INTEGER DEFAULT 0,
      places TEXT DEFAULT '[]',
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS known_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      radius_m REAL DEFAULT 200,
      icon TEXT DEFAULT 'location-outline',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_location_created ON location_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_stats(date);
  `);

  // Seed default places detection
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type ActivityType = 'stationary' | 'walking' | 'running' | 'driving' | 'cycling' | 'unknown';

export interface LocationPoint {
  id: number;
  lat: number;
  lon: number;
  speed: number;
  activity: ActivityType;
  placeName: string | null;
  createdAt: number;
}

export interface PlaceVisit {
  name: string;
  lat: number;
  lon: number;
  arrivedAt: number;
  leftAt: number | null;
  durationMin: number;
  icon: string;
}

export interface DailyStats {
  date: string;
  steps: number;
  distanceM: number;
  calories: number;
  activeMin: number;
  places: PlaceVisit[];
  summary: string | null;
}

export interface KnownPlace {
  id: number;
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  icon: string;
}

// ─── Activity detection from speed ───────────────────────────────────────────
function detectActivity(speedMs: number): ActivityType {
  if (speedMs < 0.3) return 'stationary';
  if (speedMs < 2.5) return 'walking';
  if (speedMs < 6.0) return 'running';
  if (speedMs < 8.0) return 'cycling';
  return 'driving';
}

// ─── Distance (haversine) ─────────────────────────────────────────────────────
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Calorie estimation ───────────────────────────────────────────────────────
// MET-based: walking 3.5 MET, running 8 MET, cycling 6 MET, driving 1.5 MET
const MET: Record<ActivityType, number> = {
  stationary: 1.0,
  walking: 3.5,
  running: 8.0,
  cycling: 6.0,
  driving: 1.5,
  unknown: 1.2,
};
const DEFAULT_WEIGHT_KG = 70;

function estimateCalories(activity: ActivityType, durationMin: number, weightKg = DEFAULT_WEIGHT_KG): number {
  return (MET[activity] * weightKg * durationMin) / 60;
}

// ─── Steps estimation ─────────────────────────────────────────────────────────
function estimateSteps(distanceM: number, activity: ActivityType): number {
  const strideM = activity === 'running' ? 1.4 : 0.75;
  return Math.round(distanceM / strideM);
}

// ─── Find nearest known place ─────────────────────────────────────────────────
async function findNearestPlace(lat: number, lon: number, db: SQLite.SQLiteDatabase): Promise<string | null> {
  const places = await db.getAllAsync<any>('SELECT * FROM known_places');
  for (const p of places) {
    if (haversineM(lat, lon, p.lat, p.lon) <= p.radius_m) return p.name;
  }
  return null;
}

// ─── Background task registration ────────────────────────────────────────────
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) return;
  const locations: Location.LocationObject[] = data?.locations ?? [];
  if (!locations.length) return;

  try {
    const db = await getDB();
    const now = Date.now();

    for (const loc of locations) {
      const { latitude: lat, longitude: lon, speed, accuracy, altitude, heading } = loc.coords;
      const speedMs = Math.max(0, speed ?? 0);
      const activity = detectActivity(speedMs);
      const placeName = await findNearestPlace(lat, lon, db);

      await db.runAsync(
        `INSERT INTO location_log (lat, lon, accuracy, speed, altitude, heading, activity, place_name, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [lat, lon, accuracy, speedMs, altitude, heading, activity, placeName, now]
      );
    }

    // Update today's daily stats
    await recomputeTodayStats(db);
  } catch {}
});

// ─── Recompute today's stats from raw log ────────────────────────────────────
async function recomputeTodayStats(db: SQLite.SQLiteDatabase): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const startOfDay = new Date(today).getTime();
  const endOfDay = startOfDay + 86400000;

  const points = await db.getAllAsync<any>(
    `SELECT * FROM location_log WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC`,
    [startOfDay, endOfDay]
  );

  if (points.length < 2) return;

  let totalDistanceM = 0;
  let totalCalories = 0;
  let totalSteps = 0;
  let activeMin = 0;
  const placeVisits: Record<string, { arrivedAt: number; leftAt: number; lat: number; lon: number }> = {};

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const durationMs = curr.created_at - prev.created_at;
    const durationMin = durationMs / 60000;
    const dist = haversineM(prev.lat, prev.lon, curr.lat, curr.lon);
    const activity = curr.activity as ActivityType;

    totalDistanceM += dist;
    totalCalories += estimateCalories(activity, durationMin);
    totalSteps += estimateSteps(dist, activity);
    if (activity !== 'stationary') activeMin += durationMin;

    // Place visit tracking
    if (curr.place_name) {
      if (!placeVisits[curr.place_name]) {
        placeVisits[curr.place_name] = {
          arrivedAt: curr.created_at, leftAt: curr.created_at,
          lat: curr.lat, lon: curr.lon,
        };
      } else {
        placeVisits[curr.place_name]!.leftAt = curr.created_at;
      }
    }
  }

  const placesArr: PlaceVisit[] = Object.entries(placeVisits).map(([name, v]) => ({
    name,
    lat: v.lat, lon: v.lon,
    arrivedAt: v.arrivedAt,
    leftAt: v.leftAt,
    durationMin: Math.round((v.leftAt - v.arrivedAt) / 60000),
    icon: 'location-outline',
  }));

  await db.runAsync(
    `INSERT OR REPLACE INTO daily_stats (date, steps, distance_m, calories, active_min, places)
     VALUES (?,?,?,?,?,?)`,
    [today, Math.round(totalSteps), totalDistanceM, Math.round(totalCalories), Math.round(activeMin), JSON.stringify(placesArr)]
  );
}

// ─── Start/stop background tracking ──────────────────────────────────────────
export async function startLifeTracking(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;

    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isRunning) return true;

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,       // every 30 seconds
      distanceInterval: 50,      // or every 50 meters
      foregroundService: {
        notificationTitle: 'ZON עוקב אחרי יומך',
        notificationBody: 'מיקום פעיל לסיכום יומי',
        notificationColor: '#6366f1',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopLifeTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {}
}

export async function isLifeTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

// ─── Get today's stats ────────────────────────────────────────────────────────
export async function getTodayStats(): Promise<DailyStats> {
  try {
    const db = await getDB();
    await recomputeTodayStats(db);

    const today = format(new Date(), 'yyyy-MM-dd');
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM daily_stats WHERE date = ?', [today]
    );

    if (!row) {
      return { date: today, steps: 0, distanceM: 0, calories: 0, activeMin: 0, places: [], summary: null };
    }

    return {
      date: row.date,
      steps: row.steps,
      distanceM: row.distance_m,
      calories: row.calories,
      activeMin: row.active_min,
      places: JSON.parse(row.places ?? '[]'),
      summary: row.summary,
    };
  } catch {
    return { date: format(new Date(), 'yyyy-MM-dd'), steps: 0, distanceM: 0, calories: 0, activeMin: 0, places: [], summary: null };
  }
}

// ─── Get today's location timeline ───────────────────────────────────────────
export async function getTodayTimeline(): Promise<LocationPoint[]> {
  try {
    const db = await getDB();
    const today = format(new Date(), 'yyyy-MM-dd');
    const startOfDay = new Date(today).getTime();

    const rows = await db.getAllAsync<any>(
      `SELECT * FROM location_log WHERE created_at >= ? ORDER BY created_at ASC LIMIT 2000`,
      [startOfDay]
    );

    return rows.map((r: any) => ({
      id: r.id,
      lat: r.lat, lon: r.lon,
      speed: r.speed,
      activity: r.activity as ActivityType,
      placeName: r.place_name,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

// ─── Save daily AI summary ────────────────────────────────────────────────────
export async function saveDailySummary(summary: string, date?: string): Promise<void> {
  try {
    const db = await getDB();
    const d = date ?? format(new Date(), 'yyyy-MM-dd');
    await db.runAsync('UPDATE daily_stats SET summary = ? WHERE date = ?', [summary, d]);
  } catch {}
}

// ─── Manage known places ──────────────────────────────────────────────────────
export async function addKnownPlace(name: string, lat: number, lon: number, icon = 'location-outline', radiusM = 200): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO known_places (name, lat, lon, radius_m, icon, created_at) VALUES (?,?,?,?,?,?)',
    [name, lat, lon, radiusM, icon, Date.now()]
  );
}

export async function getKnownPlaces(): Promise<KnownPlace[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>('SELECT * FROM known_places ORDER BY name ASC');
    return rows.map((r: any) => ({
      id: r.id, name: r.name, lat: r.lat, lon: r.lon, radiusM: r.radius_m, icon: r.icon,
    }));
  } catch { return []; }
}

export async function removeKnownPlace(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM known_places WHERE id = ?', [id]);
}

// ─── Save current location as a known place ───────────────────────────────────
export async function saveCurrentLocationAsPlace(name: string, icon = 'location-outline'): Promise<boolean> {
  try {
    const { status } = await Location.getPermissionsAsync();
    if (status !== 'granted') return false;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await addKnownPlace(name, loc.coords.latitude, loc.coords.longitude, icon);
    return true;
  } catch { return false; }
}

// ─── Build context string for AI ─────────────────────────────────────────────
export async function buildLifeContextString(): Promise<string> {
  try {
    const stats = await getTodayStats();
    const parts: string[] = [];

    if (stats.steps > 0) parts.push(`הלכת ${stats.steps.toLocaleString()} צעדים`);
    if (stats.calories > 0) parts.push(`שרפת ${stats.calories} קלוריות`);
    if (stats.distanceM > 0) parts.push(`התרחקת ${(stats.distanceM / 1000).toFixed(1)} ק"מ`);
    if (stats.places.length > 0) {
      const placeNames = stats.places.map((p) => p.name).join(', ');
      parts.push(`היית ב: ${placeNames}`);
    }

    return parts.length > 0 ? `[היום: ${parts.join(', ')}]` : '';
  } catch { return ''; }
}

// ─── Historical stats ─────────────────────────────────────────────────────────
export async function getWeekStats(): Promise<DailyStats[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM daily_stats ORDER BY date DESC LIMIT 7`
    );
    return rows.map((r: any) => ({
      date: r.date, steps: r.steps, distanceM: r.distance_m,
      calories: r.calories, activeMin: r.active_min,
      places: JSON.parse(r.places ?? '[]'), summary: r.summary,
    }));
  } catch { return []; }
}
