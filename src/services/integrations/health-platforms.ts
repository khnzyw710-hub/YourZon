import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { logBiometrics } from '@/services/health/biometrics';
import { logWorkout } from '@/services/health/fitness';

// ─── Health platform integrations ─────────────────────────────────────────────
// React Native health integration is platform-specific.
// This module provides the data bridge and parsing layer.

// ─── Apple HealthKit / Google Fit data simulation ─────────────────────────────
// In production: use react-native-health or @kingstinct/react-native-healthkit
// This module provides the data schema and import/parse functionality

export interface HealthKitWorkout {
  workoutType: string;
  startDate: string;
  endDate: string;
  durationSeconds: number;
  energyBurnedKcal?: number;
  distanceMeters?: number;
  heartRateAvg?: number;
}

export interface HealthKitBiometrics {
  date: string;
  weightKg?: number;
  heartRateResting?: number;
  bloodOxygenPct?: number;
  stepsCount?: number;
  activeEnergyKcal?: number;
}

// ─── Import from HealthKit data ───────────────────────────────────────────────
export async function importWorkoutsFromHealthKit(workouts: HealthKitWorkout[]): Promise<number> {
  let imported = 0;
  for (const w of workouts) {
    try {
      await logWorkout({
        date: w.startDate.slice(0, 10),
        workoutType: w.workoutType,
        durationMin: Math.round(w.durationSeconds / 60),
        caloriesBurned: w.energyBurnedKcal,
        heartRateAvg: w.heartRateAvg,
        distanceKm: w.distanceMeters ? w.distanceMeters / 1000 : undefined,
        createdAt: Date.now(),
      });
      imported++;
    } catch {}
  }
  return imported;
}

export async function importBiometricsFromHealthKit(data: HealthKitBiometrics[]): Promise<number> {
  let imported = 0;
  for (const d of data) {
    try {
      await logBiometrics({
        date: d.date,
        weightKg: d.weightKg,
        heartRateResting: d.heartRateResting,
        bloodOxygenPct: d.bloodOxygenPct,
        steps: d.stepsCount,
        activeMin: d.activeEnergyKcal ? Math.round(d.activeEnergyKcal / 5) : undefined,
        createdAt: Date.now(),
      });
      imported++;
    } catch {}
  }
  return imported;
}

// ─── Wearable device data parsing ────────────────────────────────────────────
export interface WearableData {
  device: 'apple_watch' | 'garmin' | 'fitbit' | 'whoop' | 'polar' | 'samsung';
  date: string;
  heartRate?: number;
  steps?: number;
  calories?: number;
  sleepHours?: number;
  sleepScore?: number;
  stressScore?: number;
  recoveryScore?: number;
  hrv?: number;
}

export async function parseWearableDataFromText(text: string, settings: Settings): Promise<WearableData | null> {
  const prompt = `Parse wearable device data from: "${text}"
Today: ${new Date().toISOString().slice(0, 10)}

Respond with JSON or null:
{
  "device": "apple_watch|garmin|fitbit|whoop|polar|samsung",
  "date": "YYYY-MM-DD",
  "heartRate": number or null,
  "steps": number or null,
  "calories": number or null,
  "sleepHours": number or null,
  "sleepScore": number or null,
  "hrv": number or null
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    if (response.trim().toLowerCase() === 'null') return null;
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}

// ─── AI health data analysis ──────────────────────────────────────────────────
export async function analyzeHealthTrends(data: WearableData[], settings: Settings): Promise<string> {
  if (data.length === 0) return 'No health data to analyze.';

  const summary = data.slice(0, 14).map((d) =>
    `${d.date}: HR=${d.heartRate ?? 'N/A'}, Steps=${d.steps ?? 'N/A'}, Sleep=${d.sleepHours ?? 'N/A'}h${d.hrv ? `, HRV=${d.hrv}` : ''}`
  ).join('\n');

  const prompt = `Analyze these 14-day health trends:
${summary}

Provide:
1. Key patterns you notice
2. Areas of concern (if any)
3. One specific optimization recommendation

Keep it concise and practical. This is informational, not medical advice.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Food tracking integrations ───────────────────────────────────────────────
export interface NutritionAPIFood {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingG: number;
}

export async function lookupNutritionFromText(foodName: string, settings: Settings): Promise<NutritionAPIFood | null> {
  const prompt = `Nutrition info for: "${foodName}" (standard serving)
Respond ONLY with JSON:
{"name": "...", "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "servingG": number}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}

// ─── Medication reminder integrations ────────────────────────────────────────
export function buildMedicationReminderSchedule(
  medications: Array<{ name: string; timeOfDay: string; frequency: string }>
): Array<{ time: string; medications: string[] }> {
  const timeSlots: Record<string, string[]> = {};

  for (const med of medications) {
    const time = med.timeOfDay ?? '08:00';
    if (!timeSlots[time]) timeSlots[time] = [];
    timeSlots[time].push(med.name);
  }

  return Object.entries(timeSlots)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, meds]) => ({ time, medications: meds }));
}
