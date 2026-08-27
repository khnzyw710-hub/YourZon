import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { getSleepStats } from './sleep';
import { getDailyNutrition } from './nutrition';
import { getFitnessStats } from './fitness';
import { getMoodStats } from './mental';
import { getLatestBiometrics, calculateBMI } from './biometrics';
import { getActiveMedications, getUpcomingAppointments } from './medical';

// ─── Comprehensive health report ──────────────────────────────────────────────
export interface HealthReport {
  generatedAt: number;
  period: string;
  sections: {
    sleep: string;
    nutrition: string;
    fitness: string;
    mental: string;
    biometrics: string;
    medical: string;
  };
  overallScore: number;
  topRecommendations: string[];
  summary: string;
}

export async function generateHealthReport(
  days: 7 | 14 | 30,
  settings: Settings
): Promise<HealthReport> {
  const [sleepStats, todayNutrition, fitnessStats, moodStats, biometrics, medications, appointments] =
    await Promise.all([
      getSleepStats(days).catch(() => null),
      getDailyNutrition().catch(() => null),
      getFitnessStats(days).catch(() => null),
      getMoodStats(days).catch(() => null),
      getLatestBiometrics().catch(() => null),
      getActiveMedications().catch(() => []),
      getUpcomingAppointments().catch(() => []),
    ]);

  const bmiInfo = biometrics?.weightKg && biometrics?.heightCm
    ? calculateBMI(biometrics.weightKg, biometrics.heightCm)
    : null;

  const dataSnapshot = `
SLEEP (${days}d avg): ${sleepStats?.avgDurationMin ?? 'N/A'} min/night, quality ${sleepStats?.avgQuality?.toFixed(1) ?? 'N/A'}/5, trend: ${sleepStats?.trend ?? 'N/A'}
NUTRITION (today): ${todayNutrition?.totalCalories ?? 0} kcal, ${todayNutrition?.totalProteinG?.toFixed(0) ?? 0}g protein, ${todayNutrition?.totalWaterMl ?? 0}ml water
FITNESS (${days}d): ${fitnessStats?.totalWorkouts ?? 0} workouts, ${fitnessStats?.totalDurationMin ?? 0} min total
MOOD (${days}d avg): ${moodStats?.avgMood?.toFixed(1) ?? 'N/A'}/10, energy ${moodStats?.avgEnergy?.toFixed(1) ?? 'N/A'}/5, trend: ${moodStats?.trend ?? 'N/A'}
BIOMETRICS: ${bmiInfo ? `BMI ${bmiInfo.bmi} (${bmiInfo.category})` : 'N/A'}, HR ${biometrics?.heartRateResting ?? 'N/A'} bpm
MEDICATIONS: ${medications.length} active
APPOINTMENTS: ${appointments.length} upcoming`;

  const prompt = `Generate a personalized ${days}-day health report. Be concise but insightful.

${dataSnapshot}

Respond with JSON:
{
  "sleep": "2-sentence sleep insight",
  "nutrition": "2-sentence nutrition insight",
  "fitness": "2-sentence fitness insight",
  "mental": "2-sentence mental health insight",
  "biometrics": "2-sentence biometrics insight",
  "medical": "1-sentence medication/appointment reminder",
  "overallScore": 0-100,
  "topRecommendations": ["rec1", "rec2", "rec3"],
  "summary": "3-sentence overall health summary"
}`;

  let sections = {
    sleep: 'No sleep data available.',
    nutrition: 'No nutrition data available.',
    fitness: 'No fitness data available.',
    mental: 'No mood data available.',
    biometrics: 'No biometric data available.',
    medical: medications.length > 0 ? `${medications.length} active medications.` : 'No medications tracked.',
  };
  let overallScore = 50;
  let topRecommendations: string[] = ['Log your first health data to get recommendations.'];
  let summary = 'Start tracking your health to unlock personalized insights.';

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      sections = {
        sleep: parsed.sleep ?? sections.sleep,
        nutrition: parsed.nutrition ?? sections.nutrition,
        fitness: parsed.fitness ?? sections.fitness,
        mental: parsed.mental ?? sections.mental,
        biometrics: parsed.biometrics ?? sections.biometrics,
        medical: parsed.medical ?? sections.medical,
      };
      overallScore = parsed.overallScore ?? 50;
      topRecommendations = parsed.topRecommendations ?? topRecommendations;
      summary = parsed.summary ?? summary;
    }
  } catch {}

  return {
    generatedAt: Date.now(),
    period: `${days} days`,
    sections,
    overallScore,
    topRecommendations,
    summary,
  };
}

// ─── Health score calculation ─────────────────────────────────────────────────
export async function calculateHealthScore(): Promise<{
  score: number;
  breakdown: Record<string, number>;
  level: 'excellent' | 'good' | 'fair' | 'poor';
}> {
  const [sleepStats, fitnessStats, moodStats] = await Promise.all([
    getSleepStats(7).catch(() => null),
    getFitnessStats(7).catch(() => null),
    getMoodStats(7).catch(() => null),
  ]);

  const breakdown: Record<string, number> = {};

  // Sleep score (0-25)
  if (sleepStats && sleepStats.avgDurationMin > 0) {
    const sleepScore = Math.min(25, (sleepStats.avgDurationMin / 480) * 20 + sleepStats.avgQuality * 1);
    breakdown.sleep = Math.round(sleepScore);
  } else {
    breakdown.sleep = 0;
  }

  // Fitness score (0-25)
  if (fitnessStats && fitnessStats.totalWorkouts > 0) {
    const workoutsPerWeek = (fitnessStats.totalWorkouts / 7) * 7;
    const fitnessScore = Math.min(25, workoutsPerWeek * 6);
    breakdown.fitness = Math.round(fitnessScore);
  } else {
    breakdown.fitness = 0;
  }

  // Mental score (0-25)
  if (moodStats && moodStats.avgMood > 0) {
    const mentalScore = (moodStats.avgMood / 10) * 20 + (moodStats.avgAnxiety < 3 ? 5 : 0);
    breakdown.mental = Math.round(Math.min(25, mentalScore));
  } else {
    breakdown.mental = 0;
  }

  // Activity (steps) score (0-25) — default fair if no data
  breakdown.activity = 12;

  const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
  const level: 'excellent' | 'good' | 'fair' | 'poor' =
    score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';

  return { score, breakdown, level };
}

// ─── Health trend summary (for morning briefing) ──────────────────────────────
export async function getHealthBriefing(): Promise<string> {
  const { score, level } = await calculateHealthScore();
  const sleep = await getSleepStats(3);
  const mood = await getMoodStats(3);

  const parts: string[] = [];

  if (sleep.avgDurationMin > 0) {
    const hrs = (sleep.avgDurationMin / 60).toFixed(1);
    parts.push(`Sleep: ${hrs}h avg (${sleep.trend})`);
  }
  if (mood.avgMood > 0) {
    parts.push(`Mood: ${mood.avgMood.toFixed(1)}/10`);
  }
  parts.push(`Health score: ${score}/100 (${level})`);

  return parts.join(' · ');
}
