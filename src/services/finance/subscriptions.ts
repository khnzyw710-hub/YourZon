import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    billing_cycle TEXT DEFAULT 'monthly',
    next_billing TEXT,
    category TEXT DEFAULT 'other',
    is_active INTEGER DEFAULT 1,
    notes TEXT,
    reminder_days INTEGER DEFAULT 3,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface Subscription {
  id?: number;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBilling?: string;
  category: string;
  isActive: boolean;
  notes?: string;
  reminderDays: number;
  createdAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function addSubscription(sub: Omit<Subscription, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO subscriptions (name, amount, currency, billing_cycle, next_billing, category, is_active, notes, reminder_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sub.name, sub.amount, sub.currency, sub.billingCycle, sub.nextBilling ?? null, sub.category, sub.isActive ? 1 : 0, sub.notes ?? null, sub.reminderDays, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function cancelSubscription(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE subscriptions SET is_active = 0 WHERE id = ?`, [id]);
}

export async function getSubscriptions(activeOnly = true): Promise<Subscription[]> {
  const db = await getDB();
  const rows = activeOnly
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM subscriptions WHERE is_active = 1 ORDER BY next_billing, amount DESC`)
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM subscriptions ORDER BY is_active DESC, next_billing`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    amount: r.amount,
    currency: r.currency,
    billingCycle: r.billing_cycle as BillingCycle,
    nextBilling: r.next_billing ?? undefined,
    category: r.category,
    isActive: r.is_active === 1,
    notes: r.notes ?? undefined,
    reminderDays: r.reminder_days,
    createdAt: r.created_at,
  }));
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export function getMonthlyEquivalent(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly': return amount * 4.33;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'annually': return amount / 12;
  }
}

export async function getSubscriptionStats(): Promise<{
  totalMonthlyILS: number;
  totalAnnualILS: number;
  count: number;
  byCategory: Record<string, number>;
  topCosts: Array<{ name: string; monthlyILS: number }>;
  dueThisWeek: Subscription[];
}> {
  const subs = await getSubscriptions(true);
  if (subs.length === 0) {
    return { totalMonthlyILS: 0, totalAnnualILS: 0, count: 0, byCategory: {}, topCosts: [], dueThisWeek: [] };
  }

  const totalMonthlyILS = subs.reduce((s, sub) => {
    const monthly = getMonthlyEquivalent(sub.amount, sub.billingCycle);
    return s + (sub.currency === 'USD' ? monthly * 3.7 : monthly);
  }, 0);

  const byCategory: Record<string, number> = {};
  for (const sub of subs) {
    const monthly = getMonthlyEquivalent(sub.amount, sub.billingCycle);
    byCategory[sub.category] = (byCategory[sub.category] ?? 0) + monthly;
  }

  const topCosts = subs
    .map((sub) => ({ name: sub.name, monthlyILS: getMonthlyEquivalent(sub.amount, sub.billingCycle) }))
    .sort((a, b) => b.monthlyILS - a.monthlyILS)
    .slice(0, 5);

  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const dueThisWeek = subs.filter((s) => s.nextBilling && s.nextBilling >= today && s.nextBilling <= nextWeek);

  return {
    totalMonthlyILS: Math.round(totalMonthlyILS),
    totalAnnualILS: Math.round(totalMonthlyILS * 12),
    count: subs.length,
    byCategory,
    topCosts,
    dueThisWeek,
  };
}

// ─── AI subscription advisor ──────────────────────────────────────────────────
export async function analyzeSubscriptions(settings: Settings): Promise<string> {
  const stats = await getSubscriptionStats();
  const subs = await getSubscriptions(true);
  const subList = subs.map((s) => `${s.name}: ₪${s.amount}/${s.billingCycle} (${s.category})`).join('\n');

  const prompt = `Subscription audit:
${subList}

Total monthly cost: ₪${stats.totalMonthlyILS}
Annual cost: ₪${stats.totalAnnualILS}

Identify: potential duplicates, underused category clusters, and cost-saving opportunities.
Give 3 specific recommendations.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function addSubscriptionFromVoice(text: string, settings: Settings): Promise<Partial<Subscription>> {
  const prompt = `Extract subscription details from: "${text}"
Respond ONLY with JSON:
{
  "name": "service name",
  "amount": number,
  "currency": "ILS|USD",
  "billingCycle": "weekly|monthly|quarterly|annually",
  "category": "streaming|music|software|fitness|food|news|other"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      return { ...JSON.parse(match[0]), isActive: true, reminderDays: 3 };
    }
  } catch {}

  return { isActive: true, reminderDays: 3, currency: 'ILS', billingCycle: 'monthly' };
}
