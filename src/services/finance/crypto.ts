import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_finance.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS crypto_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    avg_buy_price_usd REAL NOT NULL,
    wallet_address TEXT,
    exchange TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS crypto_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity REAL NOT NULL,
    price_usd REAL NOT NULL,
    fee_usd REAL DEFAULT 0,
    exchange TEXT,
    date TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface CryptoHolding {
  id?: number;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPriceUsd: number;
  walletAddress?: string;
  exchange?: string;
  notes?: string;
}

export type CryptoTxType = 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'earn' | 'fee';

export interface CryptoTransaction {
  id?: number;
  symbol: string;
  type: CryptoTxType;
  quantity: number;
  priceUsd: number;
  feeUsd: number;
  exchange?: string;
  date: string;
  notes?: string;
}

export async function addHolding(holding: Omit<CryptoHolding, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO crypto_holdings (symbol, name, quantity, avg_buy_price_usd, wallet_address, exchange, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [holding.symbol.toUpperCase(), holding.name, holding.quantity, holding.avgBuyPriceUsd, holding.walletAddress ?? null, holding.exchange ?? null, holding.notes ?? null, Date.now(), Date.now()]
  );
  return result.lastInsertRowId;
}

export async function logTransaction(tx: Omit<CryptoTransaction, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO crypto_transactions (symbol, type, quantity, price_usd, fee_usd, exchange, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tx.symbol.toUpperCase(), tx.type, tx.quantity, tx.priceUsd, tx.feeUsd, tx.exchange ?? null, tx.date, tx.notes ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getHoldings(): Promise<CryptoHolding[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM crypto_holdings ORDER BY symbol`);
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    quantity: r.quantity,
    avgBuyPriceUsd: r.avg_buy_price_usd,
    walletAddress: r.wallet_address ?? undefined,
    exchange: r.exchange ?? undefined,
    notes: r.notes ?? undefined,
  }));
}

// ─── Price fetching (CoinGecko free public API) ───────────────────────────────

export async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  try {
    const ids = symbols.map((s) => s.toLowerCase()).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,ils`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const result: Record<string, number> = {};
    for (const [id, prices] of Object.entries(data)) {
      result[id.toUpperCase()] = (prices as any).usd ?? 0;
    }
    return result;
  } catch {
    return {};
  }
}

export async function getPortfolioValue(
  holdings: CryptoHolding[],
  currentPrices: Record<string, number>
): Promise<{
  totalValueUsd: number;
  totalCostBasisUsd: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  byHolding: Array<{ symbol: string; valueUsd: number; pnlUsd: number; pnlPct: number }>;
}> {
  let totalValueUsd = 0;
  let totalCostBasisUsd = 0;
  const byHolding = [];

  for (const h of holdings) {
    const currentPrice = currentPrices[h.symbol] ?? h.avgBuyPriceUsd;
    const valueUsd = h.quantity * currentPrice;
    const costBasis = h.quantity * h.avgBuyPriceUsd;
    const pnlUsd = valueUsd - costBasis;
    const pnlPct = costBasis > 0 ? pnlUsd / costBasis : 0;

    totalValueUsd += valueUsd;
    totalCostBasisUsd += costBasis;

    byHolding.push({
      symbol: h.symbol,
      valueUsd: Math.round(valueUsd * 100) / 100,
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlPct: Math.round(pnlPct * 1000) / 1000,
    });
  }

  const totalPnlUsd = totalValueUsd - totalCostBasisUsd;
  const totalPnlPct = totalCostBasisUsd > 0 ? totalPnlUsd / totalCostBasisUsd : 0;

  return {
    totalValueUsd: Math.round(totalValueUsd * 100) / 100,
    totalCostBasisUsd: Math.round(totalCostBasisUsd * 100) / 100,
    totalPnlUsd: Math.round(totalPnlUsd * 100) / 100,
    totalPnlPct: Math.round(totalPnlPct * 1000) / 1000,
    byHolding,
  };
}

export async function getCryptoInsights(settings: Settings): Promise<string> {
  const holdings = await getHoldings();
  if (holdings.length === 0) return 'No crypto holdings logged yet. Add your holdings to get portfolio insights.';

  const summary = holdings.map((h) => `${h.symbol}: ${h.quantity} units @ avg $${h.avgBuyPriceUsd}`).join(', ');

  const prompt = `Crypto portfolio insights (educational only, not financial advice):
Holdings: ${summary}

Provide:
1. Diversification assessment
2. Risk profile (based on asset composition)
3. Key market events affecting this portfolio
4. Educational context about portfolio construction

Note clearly this is educational, not investment advice.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function parseTransactionFromText(text: string, settings: Settings): Promise<Partial<CryptoTransaction>> {
  const prompt = `Parse a crypto transaction from: "${text}"
Today: ${new Date().toISOString().slice(0, 10)}

Respond with JSON:
{
  "symbol": "BTC|ETH|etc",
  "type": "buy|sell|transfer_in|transfer_out|earn",
  "quantity": number,
  "priceUsd": number or null,
  "date": "YYYY-MM-DD"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {};
}
