import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS insurance_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    policy_number TEXT,
    coverage_amount REAL,
    monthly_premium REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    renewal_date TEXT NOT NULL,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export type InsuranceType = 'health' | 'car' | 'life' | 'home' | 'dental' | 'travel' | 'business' | 'disability';

export interface InsurancePolicy {
  id?: number;
  type: InsuranceType;
  provider: string;
  policyNumber?: string;
  coverageAmount?: number;
  monthlyPremium: number;
  currency: string;
  renewalDate: string;
  notes?: string;
  active: boolean;
  createdAt: number;
}

export async function addPolicy(policy: Omit<InsurancePolicy, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO insurance_policies (type, provider, policy_number, coverage_amount, monthly_premium, currency, renewal_date, notes, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      policy.type, policy.provider, policy.policyNumber ?? null,
      policy.coverageAmount ?? null, policy.monthlyPremium, policy.currency,
      policy.renewalDate, policy.notes ?? null, policy.active ? 1 : 0, Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function getPolicies(activeOnly = true): Promise<InsurancePolicy[]> {
  const db = await getDB();
  const query = activeOnly
    ? `SELECT * FROM insurance_policies WHERE active = 1 ORDER BY renewal_date`
    : `SELECT * FROM insurance_policies ORDER BY renewal_date`;
  const rows = await db.getAllAsync<Record<string, any>>(query);
  return rows.map(rowToPolicy);
}

export async function getRenewingSoon(daysAhead = 30): Promise<InsurancePolicy[]> {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT * FROM insurance_policies WHERE active = 1 AND renewal_date BETWEEN ? AND ? ORDER BY renewal_date`,
    [today, future]
  );
  return rows.map(rowToPolicy);
}

export async function getInsuranceSummary(): Promise<{
  totalMonthlyPremium: number;
  totalAnnualPremium: number;
  byType: Record<string, number>;
  renewingSoon: InsurancePolicy[];
  uninsuredRisks: string[];
}> {
  const [policies, renewingSoon] = await Promise.all([
    getPolicies(true),
    getRenewingSoon(30),
  ]);

  const totalMonthlyPremium = policies.reduce((s, p) => s + p.monthlyPremium, 0);
  const byType: Record<string, number> = {};
  for (const p of policies) {
    byType[p.type] = (byType[p.type] ?? 0) + p.monthlyPremium;
  }

  const coveredTypes = new Set(policies.map((p) => p.type));
  const essentialTypes: InsuranceType[] = ['health', 'car', 'life', 'home'];
  const uninsuredRisks = essentialTypes
    .filter((t) => !coveredTypes.has(t))
    .map((t) => `Missing ${t} insurance`);

  return {
    totalMonthlyPremium,
    totalAnnualPremium: totalMonthlyPremium * 12,
    byType,
    renewingSoon,
    uninsuredRisks,
  };
}

export async function analyzeInsuranceCoverage(settings: Settings): Promise<string> {
  const { totalMonthlyPremium, byType, uninsuredRisks, renewingSoon } = await getInsuranceSummary();

  const prompt = `Analyze this insurance portfolio (Israel context):
Monthly premiums: ₪${totalMonthlyPremium}
Coverage by type: ${JSON.stringify(byType)}
${uninsuredRisks.length ? `Uninsured risks: ${uninsuredRisks.join(', ')}` : 'All essential types covered'}
${renewingSoon.length ? `Renewing in 30 days: ${renewingSoon.map((p) => p.provider).join(', ')}` : ''}

Provide:
1. Assessment of coverage adequacy
2. Potential savings (without compromising coverage)
3. Priority action items

Keep it concise and actionable.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function parsePolicyFromText(text: string, settings: Settings): Promise<Partial<InsurancePolicy>> {
  const prompt = `Extract insurance policy details from: "${text}"

Respond with JSON:
{
  "type": "health|car|life|home|dental|travel|business|disability",
  "provider": "company name",
  "monthlyPremium": number or null,
  "coverageAmount": number or null,
  "renewalDate": "YYYY-MM-DD or null",
  "policyNumber": "string or null"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {};
}

function rowToPolicy(r: Record<string, any>): InsurancePolicy {
  return {
    id: r.id,
    type: r.type,
    provider: r.provider,
    policyNumber: r.policy_number ?? undefined,
    coverageAmount: r.coverage_amount ?? undefined,
    monthlyPremium: r.monthly_premium,
    currency: r.currency,
    renewalDate: r.renewal_date,
    notes: r.notes ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  };
}
