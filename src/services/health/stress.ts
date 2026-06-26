import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_health.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS stress_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level INTEGER NOT NULL,
    triggers TEXT,
    physical_symptoms TEXT,
    coping_used TEXT,
    date TEXT NOT NULL,
    time_of_day TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export type StressLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type StressTrigger =
  | 'work_overload'
  | 'conflict'
  | 'financial'
  | 'health'
  | 'family'
  | 'uncertainty'
  | 'time_pressure'
  | 'traffic'
  | 'news'
  | 'social'
  | 'other';

export const STRESS_INTERVENTIONS: Array<{
  name: string;
  duration: string;
  forLevel: 'low' | 'medium' | 'high';
  instructions: string;
}> = [
  {
    name: 'Box Breathing',
    duration: '4 minutes',
    forLevel: 'low',
    instructions: 'Inhale 4 sec → Hold 4 sec → Exhale 4 sec → Hold 4 sec. Repeat 8 times.',
  },
  {
    name: 'Cold Water Reset',
    duration: '2 minutes',
    forLevel: 'low',
    instructions: 'Splash cold water on face and wrists. Hold wrists under cold running water for 60 seconds.',
  },
  {
    name: 'STOP Technique',
    duration: '3 minutes',
    forLevel: 'medium',
    instructions: 'Stop what you\'re doing. Take a deep breath. Observe your thoughts without judgment. Proceed with awareness.',
  },
  {
    name: '5-4-3-2-1 Grounding',
    duration: '5 minutes',
    forLevel: 'medium',
    instructions: 'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste. Brings you to present moment.',
  },
  {
    name: 'Progressive Muscle Relaxation',
    duration: '10 minutes',
    forLevel: 'high',
    instructions: 'Tense and release each muscle group from feet to face. Hold tension 5 sec, release 30 sec.',
  },
  {
    name: 'Emergency Protocol',
    duration: '15 minutes',
    forLevel: 'high',
    instructions: '1) Remove yourself from the trigger. 2) 10 deep breaths. 3) Write down what\'s stressing you. 4) Identify ONE thing you can control. 5) Take action on that one thing only.',
  },
];

export async function logStress(
  level: StressLevel,
  triggers: StressTrigger[],
  physicalSymptoms?: string,
  copingUsed?: string
): Promise<number> {
  const db = await getDB();
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const result = await db.runAsync(
    `INSERT INTO stress_log (level, triggers, physical_symptoms, coping_used, date, time_of_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [level, JSON.stringify(triggers), physicalSymptoms ?? null, copingUsed ?? null, now.toISOString().slice(0, 10), timeOfDay, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getStressStats(days = 30): Promise<{
  avgLevel: number;
  maxLevel: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  topTriggers: Array<{ trigger: string; count: number }>;
  worstTimeOfDay: string;
  streakLowStress: number;
}> {
  const db = await getDB();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM stress_log WHERE date >= ? ORDER BY date`,
    [since]
  );

  if (rows.length === 0) {
    return { avgLevel: 0, maxLevel: 0, trendDirection: 'stable', topTriggers: [], worstTimeOfDay: 'unknown', streakLowStress: 0 };
  }

  const levels = rows.map((r) => r.level as number);
  const avgLevel = levels.reduce((s, l) => s + l, 0) / levels.length;
  const maxLevel = Math.max(...levels);

  const firstHalf = levels.slice(0, Math.floor(levels.length / 2));
  const secondHalf = levels.slice(Math.floor(levels.length / 2));
  const firstAvg = firstHalf.reduce((s, l) => s + l, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, l) => s + l, 0) / secondHalf.length;
  const trendDirection = secondAvg > firstAvg + 1 ? 'increasing' : secondAvg < firstAvg - 1 ? 'decreasing' : 'stable';

  const triggerCounts: Record<string, number> = {};
  for (const row of rows) {
    const triggers: string[] = JSON.parse(row.triggers ?? '[]');
    for (const t of triggers) triggerCounts[t] = (triggerCounts[t] ?? 0) + 1;
  }
  const topTriggers = Object.entries(triggerCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([trigger, count]) => ({ trigger, count }));

  const timeSlots: Record<string, number[]> = {};
  for (const row of rows) {
    if (!timeSlots[row.time_of_day]) timeSlots[row.time_of_day] = [];
    timeSlots[row.time_of_day].push(row.level);
  }
  const worstTimeOfDay = Object.entries(timeSlots)
    .map(([t, ls]) => ({ t, avg: ls.reduce((s, l) => s + l, 0) / ls.length }))
    .sort((a, b) => b.avg - a.avg)[0]?.t ?? 'unknown';

  const LOW_THRESHOLD = 4;
  let streakLowStress = 0;
  const dailyMaxStress = new Map<string, number>();
  for (const row of rows) {
    const current = dailyMaxStress.get(row.date) ?? 0;
    if (row.level > current) dailyMaxStress.set(row.date, row.level);
  }
  const sortedDates = Array.from(dailyMaxStress.entries()).sort(([a], [b]) => b.localeCompare(a));
  for (const [, level] of sortedDates) {
    if (level <= LOW_THRESHOLD) streakLowStress++;
    else break;
  }

  return {
    avgLevel: Math.round(avgLevel * 10) / 10,
    maxLevel,
    trendDirection,
    topTriggers,
    worstTimeOfDay,
    streakLowStress,
  };
}

export function getInterventionForLevel(level: StressLevel): typeof STRESS_INTERVENTIONS[0] {
  const tier = level <= 3 ? 'low' : level <= 6 ? 'medium' : 'high';
  const options = STRESS_INTERVENTIONS.filter((i) => i.forLevel === tier);
  return options[Math.floor(Math.random() * options.length)];
}

export async function getPersonalizedStressTip(settings: Settings): Promise<string> {
  const stats = await getStressStats(14);

  const prompt = `Stress management coaching based on 14-day data:
- Average stress level: ${stats.avgLevel}/10
- Trend: ${stats.trendDirection}
- Top triggers: ${stats.topTriggers.map((t) => t.trigger.replace(/_/g, ' ')).join(', ')}
- Most stressed time: ${stats.worstTimeOfDay}

Give ONE specific, practical technique personalized to these patterns.
Include a concrete when/where/how to use it. Under 100 words.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
