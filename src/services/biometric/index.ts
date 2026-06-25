// Biometric + Spatial Intelligence — location clustering, time-of-day patterns,
// behavioral predictions. Uses expo-location. Health data is stubbed for HealthKit
// integration (requires native module beyond current package set).

import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_biometric.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS location_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS location_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      center_lat REAL NOT NULL,
      center_lon REAL NOT NULL,
      visit_count INTEGER DEFAULT 1,
      avg_duration_min INTEGER DEFAULT 30,
      last_visit INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS time_behaviors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hour INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      cluster_label TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      UNIQUE(hour, day_of_week, cluster_label) ON CONFLICT REPLACE
    );
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LocationCluster {
  label: string;
  lat: number;
  lon: number;
  visitCount: number;
  avgDurationMin: number;
  lastVisit: number;
}

export interface SpatialContext {
  currentCluster: string | null;
  nearbyPlaces: string[];
  isKnownLocation: boolean;
  prediction: string | null;
}

// ─── Known place types (labeled by pattern) ───────────────────────────────────
const AUTO_LABELS = [
  { pattern: 'morning & evening visits', label: 'בית' },
  { pattern: 'weekday 9-18', label: 'עבודה' },
  { pattern: 'weekend mornings', label: 'ספורט' },
];

// ─── Distance calculation ─────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Cluster assignment ───────────────────────────────────────────────────────
async function assignCluster(
  lat: number,
  lon: number,
  db: SQLite.SQLiteDatabase
): Promise<string | null> {
  const clusters = await db.getAllAsync<any>(
    'SELECT * FROM location_clusters ORDER BY visit_count DESC'
  );

  for (const c of clusters) {
    const dist = haversineKm(lat, lon, c.center_lat, c.center_lon);
    if (dist < 0.2) return c.label; // within 200m = same cluster
  }

  return null; // unknown location
}

// ─── Record a location visit ──────────────────────────────────────────────────
export async function recordLocation(label?: string): Promise<string | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude: lat, longitude: lon } = loc.coords;
    const db = await getDB();
    const now = Date.now();

    // Find or create cluster
    let clusterLabel = await assignCluster(lat, lon, db);

    if (!clusterLabel) {
      // New location — create cluster with auto-generated label or user label
      const hour = new Date().getHours();
      const dow = new Date().getDay();
      clusterLabel = label ?? (
        hour < 9 || hour > 19 ? 'בית' :
        dow === 0 || dow === 6 ? 'יעד סוף שבוע' :
        'יעד'
      );

      await db.runAsync(
        'INSERT OR IGNORE INTO location_clusters (label, center_lat, center_lon, last_visit) VALUES (?,?,?,?)',
        [clusterLabel, lat, lon, now]
      );
    } else {
      await db.runAsync(
        'UPDATE location_clusters SET visit_count = visit_count + 1, last_visit = ? WHERE label = ?',
        [now, clusterLabel]
      );
    }

    await db.runAsync(
      'INSERT INTO location_history (lat, lon, label, created_at) VALUES (?,?,?,?)',
      [lat, lon, clusterLabel, now]
    );

    // Update time behavior
    const h = new Date().getHours();
    const d = new Date().getDay();
    await db.runAsync(
      `INSERT INTO time_behaviors (hour, day_of_week, cluster_label, count)
       VALUES (?,?,?,1)
       ON CONFLICT(hour, day_of_week, cluster_label) DO UPDATE SET count = count + 1`,
      [h, d, clusterLabel]
    );

    return clusterLabel;
  } catch {
    return null;
  }
}

// ─── Get current spatial context ─────────────────────────────────────────────
export async function getSpatialContext(): Promise<SpatialContext> {
  try {
    const { status } = await Location.getPermissionsAsync();
    if (status !== 'granted') return { currentCluster: null, nearbyPlaces: [], isKnownLocation: false, prediction: null };

    const loc = await Location.getLastKnownPositionAsync();
    if (!loc) return { currentCluster: null, nearbyPlaces: [], isKnownLocation: false, prediction: null };

    const db = await getDB();
    const { latitude: lat, longitude: lon } = loc.coords;
    const cluster = await assignCluster(lat, lon, db);

    // Get behavioral prediction for this time
    const h = new Date().getHours();
    const d = new Date().getDay();
    const predicted = await db.getFirstAsync<any>(
      'SELECT cluster_label, count FROM time_behaviors WHERE hour = ? AND day_of_week = ? ORDER BY count DESC LIMIT 1',
      [h, d]
    );

    const prediction = predicted && predicted.cluster_label !== cluster
      ? `בדרך כלל אתה ב${predicted.cluster_label} בשעה זו`
      : null;

    return {
      currentCluster: cluster,
      nearbyPlaces: cluster ? [cluster] : [],
      isKnownLocation: !!cluster,
      prediction,
    };
  } catch {
    return { currentCluster: null, nearbyPlaces: [], isKnownLocation: false, prediction: null };
  }
}

// ─── Get all known clusters ───────────────────────────────────────────────────
export async function getLocationClusters(): Promise<LocationCluster[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM location_clusters ORDER BY visit_count DESC'
  );
  return rows.map((r: any) => ({
    label: r.label,
    lat: r.center_lat,
    lon: r.center_lon,
    visitCount: r.visit_count,
    avgDurationMin: r.avg_duration_min,
    lastVisit: r.last_visit,
  }));
}

// ─── Update cluster label ─────────────────────────────────────────────────────
export async function relabelCluster(oldLabel: string, newLabel: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE location_clusters SET label = ? WHERE label = ?', [newLabel, oldLabel]);
  await db.runAsync('UPDATE location_history SET label = ? WHERE label = ?', [newLabel, oldLabel]);
  await db.runAsync('UPDATE time_behaviors SET cluster_label = ? WHERE cluster_label = ?', [newLabel, oldLabel]);
}

// ─── Build context string for AI injection ────────────────────────────────────
export async function buildSpatialContextString(): Promise<string> {
  const ctx = await getSpatialContext();
  const parts: string[] = [];

  if (ctx.currentCluster) parts.push(`נמצא ב: ${ctx.currentCluster}`);
  if (ctx.prediction) parts.push(ctx.prediction);

  return parts.join('. ');
}
