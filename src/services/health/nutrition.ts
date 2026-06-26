import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS food_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    description TEXT NOT NULL,
    calories INTEGER,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    water_ml INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS nutrition_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calories_target INTEGER DEFAULT 2000,
    protein_target_g REAL DEFAULT 150,
    carbs_target_g REAL DEFAULT 250,
    fat_target_g REAL DEFAULT 65,
    water_target_ml INTEGER DEFAULT 2500,
    updated_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export interface FoodEntry {
  id?: number;
  date: string;
  mealType: MealType;
  description: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  waterMl?: number;
  createdAt: number;
}

export interface DailyNutrition {
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalWaterMl: number;
  meals: FoodEntry[];
}

// ─── Log food ─────────────────────────────────────────────────────────────────
export async function logFood(entry: FoodEntry): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO food_log (date, meal_type, description, calories, protein_g, carbs_g, fat_g, water_ml, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.mealType,
      entry.description,
      entry.calories ?? null,
      entry.proteinG ?? null,
      entry.carbsG ?? null,
      entry.fatG ?? null,
      entry.waterMl ?? 0,
      entry.createdAt,
    ]
  );
}

// ─── AI nutrition analysis ────────────────────────────────────────────────────
export async function analyzeNutrition(
  foodDescription: string,
  settings: Settings
): Promise<{ calories: number; proteinG: number; carbsG: number; fatG: number; notes: string }> {
  const prompt = `Estimate nutrition for: "${foodDescription}"
Respond ONLY with JSON (no markdown):
{"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "notes": "brief note"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        calories: parsed.calories ?? 0,
        proteinG: parsed.proteinG ?? 0,
        carbsG: parsed.carbsG ?? 0,
        fatG: parsed.fatG ?? 0,
        notes: parsed.notes ?? '',
      };
    }
  } catch {}

  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, notes: 'Could not estimate.' };
}

// ─── Quick food logging from voice ────────────────────────────────────────────
export async function logFoodFromVoice(text: string, settings: Settings): Promise<FoodEntry> {
  const prompt = `Extract food log from: "${text}"
Respond ONLY with JSON:
{"mealType": "breakfast"|"lunch"|"dinner"|"snack"|"drink", "description": "...", "estimatedCalories": number}`;

  let mealType: MealType = 'snack';
  let description = text;
  let calories: number | undefined;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      mealType = (p.mealType as MealType) ?? 'snack';
      description = p.description ?? text;
      calories = p.estimatedCalories;
    }
  } catch {}

  const entry: FoodEntry = {
    date: new Date().toISOString().slice(0, 10),
    mealType,
    description,
    calories,
    createdAt: Date.now(),
  };

  await logFood(entry);
  return entry;
}

// ─── Daily summary ────────────────────────────────────────────────────────────
export async function getDailyNutrition(date?: string): Promise<DailyNutrition> {
  const db = await getDB();
  const d = date ?? new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    id: number; meal_type: string; description: string;
    calories: number | null; protein_g: number | null;
    carbs_g: number | null; fat_g: number | null;
    water_ml: number; created_at: number;
  }>(`SELECT * FROM food_log WHERE date = ? ORDER BY created_at`, [d]);

  const meals: FoodEntry[] = rows.map((r) => ({
    id: r.id,
    date: d,
    mealType: r.meal_type as MealType,
    description: r.description,
    calories: r.calories ?? undefined,
    proteinG: r.protein_g ?? undefined,
    carbsG: r.carbs_g ?? undefined,
    fatG: r.fat_g ?? undefined,
    waterMl: r.water_ml,
    createdAt: r.created_at,
  }));

  return {
    date: d,
    totalCalories: rows.reduce((s, r) => s + (r.calories ?? 0), 0),
    totalProteinG: rows.reduce((s, r) => s + (r.protein_g ?? 0), 0),
    totalCarbsG: rows.reduce((s, r) => s + (r.carbs_g ?? 0), 0),
    totalFatG: rows.reduce((s, r) => s + (r.fat_g ?? 0), 0),
    totalWaterMl: rows.reduce((s, r) => s + r.water_ml, 0),
    meals,
  };
}

// ─── Water tracking ───────────────────────────────────────────────────────────
export async function logWater(ml: number): Promise<void> {
  const db = await getDB();
  const date = new Date().toISOString().slice(0, 10);
  await db.runAsync(
    `INSERT INTO food_log (date, meal_type, description, water_ml, created_at) VALUES (?, 'drink', 'Water', ?, ?)`,
    [date, ml, Date.now()]
  );
}

export async function getWaterToday(): Promise<number> {
  const nutrition = await getDailyNutrition();
  return nutrition.totalWaterMl;
}

// ─── Nutrition coaching ───────────────────────────────────────────────────────
export async function getNutritionTip(settings: Settings): Promise<string> {
  const today = await getDailyNutrition();
  const prompt = `Nutrition coach tip based on today's intake:
Calories: ${today.totalCalories} (goal: 2000)
Protein: ${today.totalProteinG.toFixed(0)}g (goal: 150g)
Carbs: ${today.totalCarbsG.toFixed(0)}g
Fat: ${today.totalFatG.toFixed(0)}g
Water: ${today.totalWaterMl}ml (goal: 2500ml)

Give one specific actionable tip for the rest of the day (1-2 sentences).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
