import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    category TEXT NOT NULL,
    description TEXT,
    merchant TEXT,
    date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    receipt_text TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    source TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    recurring INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses(date)`);
  await _db.runAsync(`CREATE INDEX IF NOT EXISTS idx_exp_cat ON expenses(category)`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'food' | 'transport' | 'housing' | 'health' | 'entertainment' | 'shopping'
  | 'education' | 'utilities' | 'subscriptions' | 'savings' | 'investment' | 'other';

export interface Expense {
  id?: number;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  description?: string;
  merchant?: string;
  date: string;
  paymentMethod: string;
  receiptText?: string;
  tags?: string[];
  createdAt: number;
}

export interface Income {
  id?: number;
  amount: number;
  currency: string;
  source: string;
  description?: string;
  date: string;
  recurring: boolean;
  createdAt: number;
}

// ─── Log expense ──────────────────────────────────────────────────────────────
export async function logExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO expenses (amount, currency, category, description, merchant, date, payment_method, receipt_text, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      expense.amount,
      expense.currency,
      expense.category,
      expense.description ?? null,
      expense.merchant ?? null,
      expense.date,
      expense.paymentMethod,
      expense.receiptText ?? null,
      expense.tags ? JSON.stringify(expense.tags) : null,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function logIncome(income: Omit<Income, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO income (amount, currency, source, description, date, recurring, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [income.amount, income.currency, income.source, income.description ?? null, income.date, income.recurring ? 1 : 0, Date.now()]
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export async function getExpenses(params?: {
  month?: string;
  category?: ExpenseCategory;
  days?: number;
}): Promise<Expense[]> {
  const db = await getDB();
  const conditions: string[] = ['1=1'];
  const sqlParams: any[] = [];

  if (params?.month) { conditions.push(`date LIKE ?`); sqlParams.push(`${params.month}%`); }
  if (params?.days) {
    const since = new Date(Date.now() - params.days * 86400000).toISOString().slice(0, 10);
    conditions.push(`date >= ?`); sqlParams.push(since);
  }
  if (params?.category) { conditions.push(`category = ?`); sqlParams.push(params.category); }

  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM expenses WHERE ${conditions.join(' AND ')} ORDER BY date DESC, created_at DESC`,
    sqlParams
  );

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    currency: r.currency,
    category: r.category as ExpenseCategory,
    description: r.description ?? undefined,
    merchant: r.merchant ?? undefined,
    date: r.date,
    paymentMethod: r.payment_method,
    receiptText: r.receipt_text ?? undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    createdAt: r.created_at,
  }));
}

export async function getMonthlyStats(month?: string): Promise<{
  totalExpenses: number;
  totalIncome: number;
  netSavings: number;
  byCategory: Record<string, number>;
  topMerchants: Array<{ merchant: string; total: number }>;
}> {
  const db = await getDB();
  const m = month ?? new Date().toISOString().slice(0, 7);

  const [expRows, incomeRows] = await Promise.all([
    db.getAllAsync<{ category: string; merchant: string | null; amount: number }>(
      `SELECT category, merchant, amount FROM expenses WHERE date LIKE ?`, [`${m}%`]
    ),
    db.getAllAsync<{ amount: number }>(`SELECT amount FROM income WHERE date LIKE ?`, [`${m}%`]),
  ]);

  const totalExpenses = expRows.reduce((s, r) => s + r.amount, 0);
  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);

  const byCategory: Record<string, number> = {};
  for (const r of expRows) byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;

  const merchantTotals: Record<string, number> = {};
  for (const r of expRows) {
    if (r.merchant) merchantTotals[r.merchant] = (merchantTotals[r.merchant] ?? 0) + r.amount;
  }
  const topMerchants = Object.entries(merchantTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([merchant, total]) => ({ merchant, total }));

  return { totalExpenses, totalIncome, netSavings: totalIncome - totalExpenses, byCategory, topMerchants };
}

// ─── AI expense parsing ───────────────────────────────────────────────────────
export async function parseExpenseFromVoice(text: string, settings: Settings): Promise<Omit<Expense, 'id' | 'createdAt'>> {
  const prompt = `Parse expense from: "${text}"
Today: ${new Date().toISOString().slice(0, 10)}
Respond ONLY with JSON:
{
  "amount": number,
  "currency": "ILS",
  "category": "food|transport|housing|health|entertainment|shopping|education|utilities|subscriptions|savings|investment|other",
  "description": "what was bought",
  "merchant": "store/restaurant name or null",
  "date": "YYYY-MM-DD",
  "paymentMethod": "credit|debit|cash|transfer"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {
    amount: 0,
    currency: 'ILS',
    category: 'other',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash',
  };
}

export async function parseReceiptText(receiptText: string, settings: Settings): Promise<Array<Omit<Expense, 'id' | 'createdAt'>>> {
  const prompt = `Parse this receipt and extract line items:
${receiptText.slice(0, 2000)}

Respond with JSON array:
[{"description": "item", "amount": number, "category": "food|other", "currency": "ILS"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const items = JSON.parse(match[0]);
      return items.map((item: any) => ({
        ...item,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: 'credit',
      }));
    }
  } catch {}

  return [];
}

export async function getSpendingInsights(settings: Settings): Promise<string> {
  const stats = await getMonthlyStats();
  const prompt = `Personal finance advisor. This month's spending:
Total expenses: ₪${stats.totalExpenses.toFixed(0)}
Total income: ₪${stats.totalIncome.toFixed(0)}
Net savings: ₪${stats.netSavings.toFixed(0)}
By category: ${Object.entries(stats.byCategory).map(([k, v]) => `${k}: ₪${v.toFixed(0)}`).join(', ')}

Give 3 specific, actionable insights (1 sentence each). Be direct.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
