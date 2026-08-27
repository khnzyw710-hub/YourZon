import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { getExpenses } from './expenses';
import { getInvoices } from './billing';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS tax_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    document_ref TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface TaxDeduction {
  id?: number;
  year: number;
  category: string;
  description: string;
  amount: number;
  currency: string;
  documentRef?: string;
  createdAt: number;
}

export async function addTaxDeduction(deduction: Omit<TaxDeduction, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO tax_deductions (year, category, description, amount, currency, document_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [deduction.year, deduction.category, deduction.description, deduction.amount, deduction.currency, deduction.documentRef ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getTaxDeductions(year: number): Promise<TaxDeduction[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM tax_deductions WHERE year = ? ORDER BY category`, [year]);
  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    category: r.category,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    documentRef: r.document_ref ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getTaxSummary(year: number): Promise<{
  totalIncome: number;
  totalDeductions: number;
  deductionsByCategory: Record<string, number>;
  potentialRefund: string;
}> {
  const [invoices, deductions] = await Promise.all([
    getInvoices('paid').catch(() => []),
    getTaxDeductions(year),
  ]);

  const yearInvoices = invoices.filter((inv) => inv.issueDate?.startsWith(year.toString()));
  const totalIncome = yearInvoices.reduce((s, inv) => s + inv.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  const deductionsByCategory: Record<string, number> = {};
  for (const d of deductions) {
    deductionsByCategory[d.category] = (deductionsByCategory[d.category] ?? 0) + d.amount;
  }

  const estimatedTaxable = Math.max(0, totalIncome - totalDeductions);
  const potentialRefund = totalDeductions > 0
    ? `Deductions may reduce taxable income by ₪${totalDeductions.toFixed(0)}`
    : 'Log your business expenses to identify potential deductions';

  return { totalIncome, totalDeductions, deductionsByCategory, potentialRefund };
}

export async function getDeductionAdvice(occupation: string, settings: Settings): Promise<string> {
  const prompt = `Tax deduction advisor for Israeli freelancers/self-employed in: ${occupation}

List the top 8 legitimate business deductions available in Israel (Income Tax Ordinance).
For each: name, max deductible %, and a brief explanation.
Be specific to Israeli tax law.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function identifyDeductibleExpenses(settings: Settings): Promise<Array<{
  description: string;
  amount: number;
  category: string;
  deductiblePct: number;
}>> {
  const thisYear = new Date().getFullYear().toString();
  const expenses = await getExpenses({ month: thisYear.slice(0, 4) }).catch(() => []);

  const businessExpenses = expenses.filter((e) =>
    ['education', 'transport', 'utilities', 'subscriptions'].includes(e.category)
  );

  if (businessExpenses.length === 0) return [];

  const expenseText = businessExpenses.slice(0, 20)
    .map((e) => `${e.description ?? e.category}: ₪${e.amount} (${e.category})`)
    .join('\n');

  const prompt = `Which of these expenses might be tax-deductible for a self-employed person in Israel?
${expenseText}

Respond with JSON array:
[{"description": "...", "amount": number, "category": "...", "deductiblePct": 0-100}]

Only include items that are commonly deductible.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}
