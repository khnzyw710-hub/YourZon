import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 2,
    status TEXT DEFAULT 'todo',
    due_date TEXT,
    due_time TEXT,
    category TEXT,
    tags TEXT,
    parent_id INTEGER,
    estimated_min INTEGER,
    actual_min INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 1 | 2 | 3 | 4; // 1=urgent, 4=someday

export interface Task {
  id?: number;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  dueTime?: string;
  category?: string;
  tags?: string[];
  parentId?: number;
  estimatedMin?: number;
  actualMin?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO tasks (title, description, priority, status, due_date, due_time, category, tags, parent_id, estimated_min, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.title,
      task.description ?? null,
      task.priority,
      task.status,
      task.dueDate ?? null,
      task.dueTime ?? null,
      task.category ?? null,
      task.tags ? JSON.stringify(task.tags) : null,
      task.parentId ?? null,
      task.estimatedMin ?? null,
      now,
      now,
    ]
  );
  return result.lastInsertRowId;
}

export async function updateTask(id: number, updates: Partial<Task>): Promise<void> {
  const db = await getDB();
  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];

  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.priority !== undefined) { sets.push('priority = ?'); values.push(updates.priority); }
  if (updates.status !== undefined) {
    sets.push('status = ?'); values.push(updates.status);
    if (updates.status === 'done') { sets.push('completed_at = ?'); values.push(Date.now()); }
  }
  if (updates.dueDate !== undefined) { sets.push('due_date = ?'); values.push(updates.dueDate); }
  if (updates.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.actualMin !== undefined) { sets.push('actual_min = ?'); values.push(updates.actualMin); }

  values.push(id);
  await db.runAsync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM tasks WHERE id = ? OR parent_id = ?`, [id, id]);
}

export async function completeTask(id: number): Promise<void> {
  await updateTask(id, { status: 'done' });
}

// ─── Queries ──────────────────────────────────────────────────────────────────
function parseTaskRow(r: Record<string, any>): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    priority: r.priority as TaskPriority,
    status: r.status as TaskStatus,
    dueDate: r.due_date ?? undefined,
    dueTime: r.due_time ?? undefined,
    category: r.category ?? undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    parentId: r.parent_id ?? undefined,
    estimatedMin: r.estimated_min ?? undefined,
    actualMin: r.actual_min ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at ?? undefined,
  };
}

export async function getTasks(filter?: {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  dueToday?: boolean;
}): Promise<Task[]> {
  const db = await getDB();
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (filter?.status) { conditions.push('status = ?'); params.push(filter.status); }
  if (filter?.priority) { conditions.push('priority = ?'); params.push(filter.priority); }
  if (filter?.category) { conditions.push('category = ?'); params.push(filter.category); }
  if (filter?.dueToday) {
    const today = new Date().toISOString().slice(0, 10);
    conditions.push('due_date = ?'); params.push(today);
  }

  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY priority ASC, due_date ASC, created_at DESC`,
    params
  );
  return rows.map(parseTaskRow);
}

export async function getOverdueTasks(): Promise<Task[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM tasks WHERE status != 'done' AND status != 'cancelled' AND due_date < ? ORDER BY due_date, priority`,
    [today]
  );
  return rows.map(parseTaskRow);
}

// ─── AI task features ─────────────────────────────────────────────────────────
export async function parseTaskFromVoice(text: string, settings: Settings): Promise<Partial<Task>> {
  const prompt = `Parse a task from this voice input: "${text}"
Today is ${new Date().toISOString().slice(0, 10)}.
Respond ONLY with JSON:
{
  "title": "concise task title",
  "description": "optional details or null",
  "priority": 1-4 (1=urgent, 2=high, 3=normal, 4=someday),
  "dueDate": "YYYY-MM-DD or null",
  "category": "work|personal|health|finance|other or null"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { title: text, priority: 3 };
}

export async function breakdownTask(task: Task, settings: Settings): Promise<string[]> {
  const prompt = `Break this task into 3-7 specific subtasks:
Task: "${task.title}"
${task.description ? `Details: ${task.description}` : ''}

List only the subtasks, one per line. Be specific and actionable.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 3)
    .slice(0, 7);
}

export async function prioritizeTasks(tasks: Task[], settings: Settings): Promise<Task[]> {
  if (tasks.length === 0) return [];

  const taskList = tasks.map((t, i) => `${i + 1}. ${t.title} (priority: ${t.priority}, due: ${t.dueDate ?? 'no date'})`).join('\n');
  const prompt = `Prioritize these tasks using the Eisenhower matrix (urgent/important). Return the numbers in ideal order:
${taskList}

Respond with ONLY the numbers in order, comma-separated (e.g., "3, 1, 2, 4").`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const nums = response.match(/\d+/g)?.map(Number) ?? [];
    if (nums.length > 0) {
      return nums
        .filter((n) => n >= 1 && n <= tasks.length)
        .map((n) => tasks[n - 1])
        .filter(Boolean);
    }
  } catch {}

  return tasks.sort((a, b) => a.priority - b.priority);
}

// ─── Task stats ───────────────────────────────────────────────────────────────
export async function getTaskStats(): Promise<{
  total: number;
  completed: number;
  overdue: number;
  completionRate: number;
  avgCompletionTimeMin: number;
}> {
  const db = await getDB();
  const [total, completed, overdue] = await Promise.all([
    db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM tasks WHERE status != 'cancelled'`),
    db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM tasks WHERE status = 'done'`),
    getOverdueTasks(),
  ]);

  const completedWithTime = await db.getAllAsync<{ actual_min: number }>(
    `SELECT actual_min FROM tasks WHERE status = 'done' AND actual_min IS NOT NULL`
  );
  const avgCompletionTimeMin = completedWithTime.length > 0
    ? completedWithTime.reduce((s, r) => s + r.actual_min, 0) / completedWithTime.length
    : 0;

  const totalCount = total?.count ?? 0;
  const completedCount = completed?.count ?? 0;

  return {
    total: totalCount,
    completed: completedCount,
    overdue: overdue.length,
    completionRate: totalCount > 0 ? completedCount / totalCount : 0,
    avgCompletionTimeMin: Math.round(avgCompletionTimeMin),
  };
}
