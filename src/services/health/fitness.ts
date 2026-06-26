import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS workout_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    workout_type TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    exercises TEXT,
    calories_burned INTEGER,
    heart_rate_avg INTEGER,
    heart_rate_max INTEGER,
    distance_km REAL,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS personal_records (
    exercise TEXT PRIMARY KEY,
    best_weight_kg REAL,
    best_reps INTEGER,
    best_distance_km REAL,
    best_time_sec INTEGER,
    achieved_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WorkoutExercise {
  name: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  distanceKm?: number;
}

export interface WorkoutEntry {
  id?: number;
  date: string;
  workoutType: string;
  durationMin: number;
  exercises?: WorkoutExercise[];
  caloriesBurned?: number;
  heartRateAvg?: number;
  heartRateMax?: number;
  distanceKm?: number;
  notes?: string;
  createdAt: number;
}

export interface PersonalRecord {
  exercise: string;
  bestWeightKg?: number;
  bestReps?: number;
  bestDistanceKm?: number;
  bestTimeSec?: number;
  achievedAt: number;
}

// ─── Log workout ──────────────────────────────────────────────────────────────
export async function logWorkout(entry: WorkoutEntry): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO workout_log (date, workout_type, duration_min, exercises, calories_burned, heart_rate_avg, heart_rate_max, distance_km, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.workoutType,
      entry.durationMin,
      entry.exercises ? JSON.stringify(entry.exercises) : null,
      entry.caloriesBurned ?? null,
      entry.heartRateAvg ?? null,
      entry.heartRateMax ?? null,
      entry.distanceKm ?? null,
      entry.notes ?? null,
      entry.createdAt,
    ]
  );

  // Check for personal records
  if (entry.exercises) {
    for (const ex of entry.exercises) {
      await updatePersonalRecord(ex);
    }
  }
}

// ─── Personal records ─────────────────────────────────────────────────────────
async function updatePersonalRecord(exercise: WorkoutExercise): Promise<void> {
  const db = await getDB();
  const existing = await db.getFirstAsync<PersonalRecord>(
    `SELECT * FROM personal_records WHERE exercise = ?`,
    [exercise.name]
  );

  const isNewRecord =
    !existing ||
    (exercise.weightKg && exercise.weightKg > (existing.bestWeightKg ?? 0)) ||
    (exercise.distanceKm && exercise.distanceKm > (existing.bestDistanceKm ?? 0));

  if (isNewRecord) {
    await db.runAsync(
      `INSERT OR REPLACE INTO personal_records (exercise, best_weight_kg, best_reps, best_distance_km, best_time_sec, achieved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        exercise.name,
        exercise.weightKg ?? existing?.bestWeightKg ?? null,
        exercise.reps ?? existing?.bestReps ?? null,
        exercise.distanceKm ?? existing?.bestDistanceKm ?? null,
        exercise.durationSec ?? existing?.bestTimeSec ?? null,
        Date.now(),
      ]
    );
  }
}

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const db = await getDB();
  return db.getAllAsync<PersonalRecord>(
    `SELECT exercise, best_weight_kg as bestWeightKg, best_reps as bestReps, best_distance_km as bestDistanceKm, best_time_sec as bestTimeSec, achieved_at as achievedAt
     FROM personal_records ORDER BY achieved_at DESC`
  );
}

// ─── Workout history ──────────────────────────────────────────────────────────
export async function getWorkoutHistory(days = 30): Promise<WorkoutEntry[]> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number; date: string; workout_type: string; duration_min: number;
    exercises: string | null; calories_burned: number | null;
    heart_rate_avg: number | null; heart_rate_max: number | null;
    distance_km: number | null; notes: string | null; created_at: number;
  }>(`SELECT * FROM workout_log WHERE date >= ? ORDER BY date DESC`, [since]);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    workoutType: r.workout_type,
    durationMin: r.duration_min,
    exercises: r.exercises ? JSON.parse(r.exercises) : undefined,
    caloriesBurned: r.calories_burned ?? undefined,
    heartRateAvg: r.heart_rate_avg ?? undefined,
    heartRateMax: r.heart_rate_max ?? undefined,
    distanceKm: r.distance_km ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── AI workout planner ───────────────────────────────────────────────────────
export async function generateWorkoutPlan(
  goal: string,
  daysPerWeek: number,
  durationMin: number,
  equipment: string,
  settings: Settings
): Promise<string> {
  const prompt = `Create a ${daysPerWeek}-day/week workout plan:
Goal: ${goal}
Session duration: ${durationMin} min
Equipment: ${equipment}

List exercises with sets/reps. Be specific and practical. Format as a clean list.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Voice workout logging ────────────────────────────────────────────────────
export async function logWorkoutFromVoice(text: string, settings: Settings): Promise<WorkoutEntry> {
  const prompt = `Parse workout from: "${text}"
Respond ONLY with JSON:
{"workoutType": "...", "durationMin": number, "exercises": [{"name":"...", "sets":number, "reps":number, "weightKg":number}], "notes": "..."}`;

  let workoutType = 'General';
  let durationMin = 30;
  let exercises: WorkoutExercise[] = [];
  let notes = '';

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      workoutType = p.workoutType ?? 'General';
      durationMin = p.durationMin ?? 30;
      exercises = p.exercises ?? [];
      notes = p.notes ?? '';
    }
  } catch {}

  const entry: WorkoutEntry = {
    date: new Date().toISOString().slice(0, 10),
    workoutType,
    durationMin,
    exercises,
    notes,
    createdAt: Date.now(),
  };

  await logWorkout(entry);
  return entry;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getFitnessStats(days = 30): Promise<{
  totalWorkouts: number;
  totalDurationMin: number;
  totalCaloriesBurned: number;
  avgDurationMin: number;
  mostFrequentType: string;
  weeklyStreak: number;
}> {
  const history = await getWorkoutHistory(days);
  if (history.length === 0) {
    return { totalWorkouts: 0, totalDurationMin: 0, totalCaloriesBurned: 0, avgDurationMin: 0, mostFrequentType: '', weeklyStreak: 0 };
  }

  const totalDurationMin = history.reduce((s, h) => s + h.durationMin, 0);
  const totalCaloriesBurned = history.reduce((s, h) => s + (h.caloriesBurned ?? 0), 0);

  const typeCounts: Record<string, number> = {};
  for (const h of history) typeCounts[h.workoutType] = (typeCounts[h.workoutType] ?? 0) + 1;
  const mostFrequentType = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';

  // Weekly streak: consecutive weeks with at least 1 workout
  const weeks = new Set(history.map((h) => {
    const d = new Date(h.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    return weekStart.toISOString().slice(0, 10);
  }));
  const weeklyStreak = weeks.size; // simplified

  return {
    totalWorkouts: history.length,
    totalDurationMin,
    totalCaloriesBurned,
    avgDurationMin: Math.round(totalDurationMin / history.length),
    mostFrequentType,
    weeklyStreak,
  };
}
