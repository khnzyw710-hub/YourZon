import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS career_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    target_date TEXT,
    milestones TEXT,
    progress_pct INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    category TEXT DEFAULT 'career',
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS skills_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    hours_practiced REAL DEFAULT 0,
    notes TEXT,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    impact TEXT,
    date TEXT NOT NULL,
    category TEXT DEFAULT 'work',
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CareerGoal {
  id?: number;
  title: string;
  description?: string;
  targetDate?: string;
  milestones?: string[];
  progressPct: number;
  status: 'active' | 'completed' | 'paused';
  category: string;
  createdAt: number;
}

export interface Skill {
  id?: number;
  skill: string;
  level: 1 | 2 | 3 | 4 | 5;
  hoursPracticed: number;
  notes?: string;
  updatedAt: number;
}

export interface Achievement {
  id?: number;
  title: string;
  description?: string;
  impact?: string;
  date: string;
  category: string;
  createdAt: number;
}

// ─── Career goals ─────────────────────────────────────────────────────────────
export async function addCareerGoal(goal: Omit<CareerGoal, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO career_goals (title, description, target_date, milestones, progress_pct, status, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [goal.title, goal.description ?? null, goal.targetDate ?? null, goal.milestones ? JSON.stringify(goal.milestones) : null, goal.progressPct, goal.status, goal.category, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function updateGoalProgress(id: number, progressPct: number): Promise<void> {
  const db = await getDB();
  const status = progressPct >= 100 ? 'completed' : 'active';
  await db.runAsync(`UPDATE career_goals SET progress_pct = ?, status = ? WHERE id = ?`, [Math.min(100, progressPct), status, id]);
}

export async function getCareerGoals(): Promise<CareerGoal[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM career_goals WHERE status = 'active' ORDER BY target_date ASC`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    targetDate: r.target_date ?? undefined,
    milestones: r.milestones ? JSON.parse(r.milestones) : undefined,
    progressPct: r.progress_pct,
    status: r.status,
    category: r.category,
    createdAt: r.created_at,
  }));
}

// ─── Skills ───────────────────────────────────────────────────────────────────
export async function logSkillPractice(skillName: string, hoursAdded: number, notes?: string): Promise<void> {
  const db = await getDB();
  const existing = await db.getFirstAsync<{ id: number; hours_practiced: number }>(
    `SELECT id, hours_practiced FROM skills_log WHERE skill = ?`, [skillName]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE skills_log SET hours_practiced = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [existing.hours_practiced + hoursAdded, notes ?? null, Date.now(), existing.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO skills_log (skill, level, hours_practiced, notes, updated_at) VALUES (?, 1, ?, ?, ?)`,
      [skillName, hoursAdded, notes ?? null, Date.now()]
    );
  }
}

export async function getSkills(): Promise<Skill[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM skills_log ORDER BY hours_practiced DESC`);
  return rows.map((r) => ({
    id: r.id,
    skill: r.skill,
    level: r.level as Skill['level'],
    hoursPracticed: r.hours_practiced,
    notes: r.notes ?? undefined,
    updatedAt: r.updated_at,
  }));
}

// ─── Achievements ─────────────────────────────────────────────────────────────
export async function logAchievement(achievement: Omit<Achievement, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO achievements (title, description, impact, date, category, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [achievement.title, achievement.description ?? null, achievement.impact ?? null, achievement.date, achievement.category, Date.now()]
  );
}

export async function getAchievements(limit = 30): Promise<Achievement[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM achievements ORDER BY date DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    impact: r.impact ?? undefined,
    date: r.date,
    category: r.category,
    createdAt: r.created_at,
  }));
}

// ─── AI career features ───────────────────────────────────────────────────────
export async function generateCareerPlan(
  currentRole: string,
  targetRole: string,
  timeline: string,
  settings: Settings
): Promise<string> {
  const prompt = `Create a career development plan:
Current: ${currentRole}
Target: ${targetRole}
Timeline: ${timeline}

Include: skill gaps to close, milestones with dates, learning resources, networking actions, and quick wins.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function reviewPerformance(period: string, achievements: string[], challenges: string[], settings: Settings): Promise<string> {
  const prompt = `Write a professional performance self-review for ${period}:
Key achievements: ${achievements.join('; ')}
Challenges overcome: ${challenges.join('; ')}

Write in first person, professional tone, 3-4 paragraphs. Include impact and growth.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function prepareInterviewAnswers(role: string, company: string, questions: string[], settings: Settings): Promise<string> {
  const prompt = `Prepare STAR-format interview answers for:
Role: ${role}
Company: ${company}
Questions: ${questions.join('\n')}

For each question, give a concise STAR answer (Situation, Task, Action, Result).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function buildResumeBullets(achievements: Achievement[], settings: Settings): Promise<string[]> {
  const achText = achievements.slice(0, 10).map((a) => `${a.title}: ${a.description ?? ''} Impact: ${a.impact ?? 'N/A'}`).join('\n');
  const prompt = `Convert these achievements into powerful resume bullet points (action verb + number + impact):
${achText}

Write one bullet per achievement. Start with strong action verbs. Include metrics where possible.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 10);
}
