import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    target_value REAL,
    current_value REAL DEFAULT 0,
    unit TEXT,
    deadline TEXT,
    status TEXT DEFAULT 'active',
    parent_goal_id INTEGER,
    why TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS goal_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    target_value REAL,
    achieved INTEGER DEFAULT 0,
    achieved_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS goal_check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    value REAL NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export type GoalCategory = 'health' | 'finance' | 'career' | 'learning' | 'relationships' | 'personal' | 'creative' | 'spiritual';
export type GoalType = 'numeric' | 'boolean' | 'habit' | 'project';

export interface Goal {
  id?: number;
  title: string;
  description?: string;
  category: GoalCategory;
  type: GoalType;
  targetValue?: number;
  currentValue: number;
  unit?: string;
  deadline?: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  parentGoalId?: number;
  why?: string;
  createdAt: number;
  updatedAt: number;
}

export async function createGoal(goal: Omit<Goal, 'id' | 'currentValue' | 'status' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO goals (title, description, category, type, target_value, current_value, unit, deadline, status, parent_goal_id, why, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?, ?, ?)`,
    [goal.title, goal.description ?? null, goal.category, goal.type, goal.targetValue ?? null, goal.unit ?? null, goal.deadline ?? null, goal.parentGoalId ?? null, goal.why ?? null, now, now]
  );
  return result.lastInsertRowId;
}

export async function updateGoalProgress(id: number, newValue: number, note?: string): Promise<void> {
  const db = await getDB();
  const goal = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM goals WHERE id = ?`, [id]);
  if (!goal) return;

  const today = new Date().toISOString().slice(0, 10);
  await db.runAsync(`UPDATE goals SET current_value = ?, updated_at = ? WHERE id = ?`, [newValue, Date.now(), id]);
  await db.runAsync(
    `INSERT INTO goal_check_ins (goal_id, value, note, date, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, newValue, note ?? null, today, Date.now()]
  );

  if (goal.target_value && newValue >= goal.target_value) {
    await db.runAsync(`UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ?`, [Date.now(), id]);
  }
}

export async function getActiveGoals(category?: GoalCategory): Promise<Goal[]> {
  const db = await getDB();
  const rows = category
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM goals WHERE status = 'active' AND category = ? ORDER BY deadline ASC`, [category])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM goals WHERE status = 'active' ORDER BY category, deadline ASC`);
  return rows.map(rowToGoal);
}

export async function getGoalProgress(id: number): Promise<Array<{ date: string; value: number; note?: string }>> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM goal_check_ins WHERE goal_id = ? ORDER BY date ASC`,
    [id]
  );
  return rows.map((r) => ({ date: r.date, value: r.value, note: r.note ?? undefined }));
}

export async function generateGoalPlan(goal: Goal, settings: Settings): Promise<{
  milestones: Array<{ title: string; targetValue?: number; targetDate: string }>;
  weeklyActions: string[];
  potentialObstacles: Array<{ obstacle: string; mitigation: string }>;
}> {
  const deadline = goal.deadline ? `Deadline: ${goal.deadline}` : 'No fixed deadline';
  const progress = goal.targetValue ? `${Math.round((goal.currentValue / goal.targetValue) * 100)}% complete` : 'Starting out';

  const prompt = `Create an implementation plan for goal: "${goal.title}"
Category: ${goal.category}
${goal.description ? `Description: ${goal.description}` : ''}
${goal.why ? `Why it matters: ${goal.why}` : ''}
${deadline}
Current progress: ${progress}

Respond with JSON:
{
  "milestones": [{"title": "...", "targetValue": number or null, "targetDate": "YYYY-MM-DD"}],
  "weeklyActions": ["specific weekly action x5"],
  "potentialObstacles": [{"obstacle": "...", "mitigation": "..."}]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { milestones: [], weeklyActions: [], potentialObstacles: [] };
}

export async function reflectOnGoal(goal: Goal, settings: Settings): Promise<string> {
  const history = await getGoalProgress(goal.id!);
  const recentProgress = history.slice(-5).map((h) => `${h.date}: ${h.value}${goal.unit ? ` ${goal.unit}` : ''}`).join(', ');

  const prompt = `Reflect on goal progress: "${goal.title}"
Type: ${goal.category}
Progress: ${recentProgress || 'No check-ins yet'}
${goal.targetValue ? `Target: ${goal.targetValue}${goal.unit ?? ''}` : ''}

Provide:
1. What's working well
2. What needs adjustment
3. One specific next action for this week
4. Motivational insight connected to the goal's purpose${goal.why ? ` (why: ${goal.why})` : ''}`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function breakdownGoalIntoTasks(goal: Goal, settings: Settings): Promise<Array<{
  title: string;
  priority: number;
  estimatedHours: number;
  dueDate?: string;
}>> {
  const prompt = `Break down goal "${goal.title}" into specific, actionable tasks (max 10).
${goal.description ?? ''}
${goal.deadline ? `Deadline: ${goal.deadline}` : ''}

Respond with JSON array:
[{"title": "task", "priority": 1-4, "estimatedHours": number, "dueDate": "YYYY-MM-DD or null"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

function rowToGoal(r: Record<string, any>): Goal {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    category: r.category,
    type: r.type,
    targetValue: r.target_value ?? undefined,
    currentValue: r.current_value,
    unit: r.unit ?? undefined,
    deadline: r.deadline ?? undefined,
    status: r.status,
    parentGoalId: r.parent_goal_id ?? undefined,
    why: r.why ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
