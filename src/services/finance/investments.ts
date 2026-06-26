import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    name TEXT,
    type TEXT DEFAULT 'stock',
    quantity REAL NOT NULL,
    avg_buy_price REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_value REAL NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type AssetType = 'stock' | 'etf' | 'crypto' | 'bond' | 'real_estate' | 'mutual_fund' | 'pension' | 'other';

export interface PortfolioAsset {
  id?: number;
  symbol: string;
  name?: string;
  type: AssetType;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Portfolio CRUD ───────────────────────────────────────────────────────────
export async function addAsset(asset: Omit<PortfolioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO portfolio (symbol, name, type, quantity, avg_buy_price, currency, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [asset.symbol.toUpperCase(), asset.name ?? null, asset.type, asset.quantity, asset.avgBuyPrice, asset.currency, asset.notes ?? null, now, now]
  );
  return result.lastInsertRowId;
}

export async function updateAsset(id: number, updates: Partial<Pick<PortfolioAsset, 'quantity' | 'avgBuyPrice' | 'notes'>>): Promise<void> {
  const db = await getDB();
  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [Date.now()];
  if (updates.quantity !== undefined) { sets.push('quantity = ?'); values.push(updates.quantity); }
  if (updates.avgBuyPrice !== undefined) { sets.push('avg_buy_price = ?'); values.push(updates.avgBuyPrice); }
  if (updates.notes !== undefined) { sets.push('notes = ?'); values.push(updates.notes); }
  values.push(id);
  await db.runAsync(`UPDATE portfolio SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function getPortfolio(): Promise<PortfolioAsset[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM portfolio WHERE quantity > 0 ORDER BY type, symbol`);
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name ?? undefined,
    type: r.type as AssetType,
    quantity: r.quantity,
    avgBuyPrice: r.avg_buy_price,
    currency: r.currency,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ─── Portfolio analytics ──────────────────────────────────────────────────────
export async function getPortfolioSummary(): Promise<{
  totalCostBasis: number;
  byType: Record<AssetType, { count: number; costBasis: number }>;
  diversificationScore: number;
}> {
  const portfolio = await getPortfolio();

  const totalCostBasis = portfolio.reduce((s, a) => s + a.quantity * a.avgBuyPrice, 0);
  const byType = {} as Record<AssetType, { count: number; costBasis: number }>;

  for (const asset of portfolio) {
    if (!byType[asset.type]) byType[asset.type] = { count: 0, costBasis: 0 };
    byType[asset.type].count++;
    byType[asset.type].costBasis += asset.quantity * asset.avgBuyPrice;
  }

  const typeCount = Object.keys(byType).length;
  const diversificationScore = Math.min(100, typeCount * 20);

  return { totalCostBasis, byType, diversificationScore };
}

export async function savePortfolioSnapshot(totalValue: number, notes?: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO portfolio_snapshots (date, total_value, notes, created_at) VALUES (?, ?, ?, ?)`,
    [new Date().toISOString().slice(0, 10), totalValue, notes ?? null, Date.now()]
  );
}

// ─── AI investment features ───────────────────────────────────────────────────
export async function getInvestmentAdvice(riskTolerance: 'low' | 'medium' | 'high', goals: string[], settings: Settings): Promise<string> {
  const prompt = `Investment guidance (not personal financial advice):
Risk tolerance: ${riskTolerance}
Goals: ${goals.join(', ')}

In the context of Israeli financial markets:
Provide educational information about investment approaches, asset classes, and general strategies.
Remind that past performance doesn't guarantee future results and to consult a licensed financial advisor.
3-4 bullet points.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function explainFinancialTerm(term: string, settings: Settings): Promise<string> {
  const prompt = `Explain this financial/investment term in simple Hebrew/English (adapt to what the user will understand):
Term: "${term}"

2-3 sentences. Use an analogy if helpful. No jargon.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function analyzePortfolioDiversification(settings: Settings): Promise<string> {
  const summary = await getPortfolioSummary();
  const prompt = `Analyze portfolio diversification:
Total cost basis: ₪${summary.totalCostBasis.toFixed(0)}
Asset allocation:
${Object.entries(summary.byType).map(([type, info]) => `${type}: ${info.count} positions (₪${info.costBasis.toFixed(0)})`).join('\n')}
Diversification score: ${summary.diversificationScore}/100

Provide 3 educational observations about this allocation. Not financial advice.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Compound interest calculator ─────────────────────────────────────────────
export function calculateCompoundGrowth(params: {
  principal: number;
  annualRatePercent: number;
  years: number;
  monthlyContribution?: number;
}): { finalAmount: number; totalContributions: number; totalGrowth: number; yearByYear: Array<{ year: number; value: number }> } {
  const rate = params.annualRatePercent / 100 / 12;
  const months = params.years * 12;
  const monthly = params.monthlyContribution ?? 0;

  const yearByYear: Array<{ year: number; value: number }> = [];
  let value = params.principal;

  for (let m = 1; m <= months; m++) {
    value = value * (1 + rate) + monthly;
    if (m % 12 === 0) {
      yearByYear.push({ year: m / 12, value: Math.round(value) });
    }
  }

  const finalAmount = Math.round(value);
  const totalContributions = params.principal + monthly * months;
  const totalGrowth = finalAmount - totalContributions;

  return { finalAmount, totalContributions, totalGrowth, yearByYear };
}
