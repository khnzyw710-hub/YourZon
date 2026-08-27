import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { getExpenses, getMonthlyStats } from './expenses';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category TEXT NOT NULL,
    limit_amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    UNIQUE(month, category)
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    target_date TEXT,
    currency TEXT DEFAULT 'ILS',
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Budget {
  month: string;
  category: string;
  limitAmount: number;
  currency: string;
  spent?: number;
  remaining?: number;
  pctUsed?: number;
}

export interface SavingsGoal {
  id?: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  currency: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: number;
}

// ─── Budget CRUD ──────────────────────────────────────────────────────────────
export async function setBudget(month: string, category: string, limitAmount: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO budgets (month, category, limit_amount) VALUES (?, ?, ?)
     ON CONFLICT(month, category) DO UPDATE SET limit_amount = excluded.limit_amount`,
    [month, category, limitAmount]
  );
}

export async function getBudgets(month?: string): Promise<Budget[]> {
  const db = await getDB();
  const m = month ?? new Date().toISOString().slice(0, 7);
  const budgetRows = await db.getAllAsync<{ category: string; limit_amount: number; currency: string }>(
    `SELECT category, limit_amount, currency FROM budgets WHERE month = ?`, [m]
  );

  if (budgetRows.length === 0) return [];

  const stats = await getMonthlyStats(m);

  return budgetRows.map((b) => {
    const spent = stats.byCategory[b.category] ?? 0;
    const remaining = b.limit_amount - spent;
    return {
      month: m,
      category: b.category,
      limitAmount: b.limit_amount,
      currency: b.currency,
      spent,
      remaining,
      pctUsed: b.limit_amount > 0 ? spent / b.limit_amount : 0,
    };
  });
}

export async function getOverBudgetCategories(month?: string): Promise<Budget[]> {
  const budgets = await getBudgets(month);
  return budgets.filter((b) => (b.pctUsed ?? 0) > 1);
}

// ─── Savings goals ────────────────────────────────────────────────────────────
export async function addSavingsGoal(goal: Omit<SavingsGoal, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO savings_goals (name, target_amount, current_amount, target_date, currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [goal.name, goal.targetAmount, goal.currentAmount, goal.targetDate ?? null, goal.currency, goal.status, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function addToSavingsGoal(id: number, amount: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE savings_goals SET current_amount = MIN(target_amount, current_amount + ?),
     status = CASE WHEN current_amount + ? >= target_amount THEN 'completed' ELSE status END
     WHERE id = ?`,
    [amount, amount, id]
  );
}

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM savings_goals WHERE status != 'completed' ORDER BY target_date ASC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    currentAmount: r.current_amount,
    targetDate: r.target_date ?? undefined,
    currency: r.currency,
    status: r.status as SavingsGoal['status'],
    createdAt: r.created_at,
  }));
}

// ─── AI budget features ───────────────────────────────────────────────────────
export async function generateBudgetPlan(monthlyIncome: number, goals: string[], settings: Settings): Promise<string> {
  const prompt = `Create a monthly budget plan:
Net monthly income: ₪${monthlyIncome}
Financial goals: ${goals.join(', ')}

Apply the 50/30/20 rule adapted for Israel (consider high housing costs, VAT).
List each budget category with amount and percentage. Be specific.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function analyzeBudgetHealth(settings: Settings): Promise<string> {
  const budgets = await getBudgets();
  const overBudget = budgets.filter((b) => (b.pctUsed ?? 0) > 1);
  const nearLimit = budgets.filter((b) => (b.pctUsed ?? 0) > 0.8 && (b.pctUsed ?? 0) <= 1);

  const prompt = `Analyze this month's budget:
${budgets.map((b) => `${b.category}: ₪${b.spent?.toFixed(0)} / ₪${b.limitAmount} (${Math.round((b.pctUsed ?? 0) * 100)}%)`).join('\n')}

Over budget: ${overBudget.map((b) => b.category).join(', ') || 'None'}
Near limit: ${nearLimit.map((b) => b.category).join(', ') || 'None'}

Give 3 specific recommendations to stay on track (1 sentence each).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function projectSavingsGoal(goal: SavingsGoal, monthlyContribution: number): Promise<{
  monthsToGoal: number;
  completionDate: string;
  totalNeeded: number;
}> {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (monthlyContribution <= 0) {
    return { monthsToGoal: Infinity, completionDate: 'Never', totalNeeded: remaining };
  }

  const monthsToGoal = Math.ceil(remaining / monthlyContribution);
  const completionDate = new Date(Date.now() + monthsToGoal * 30 * 86400000).toISOString().slice(0, 7);

  return { monthsToGoal, completionDate, totalNeeded: remaining };
}
