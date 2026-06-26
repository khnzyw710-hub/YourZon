import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_productivity.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'ILS',
    status TEXT DEFAULT 'draft',
    issue_date TEXT NOT NULL,
    due_date TEXT,
    paid_date TEXT,
    items TEXT,
    notes TEXT,
    invoice_number TEXT,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT NOT NULL,
    project TEXT,
    description TEXT NOT NULL,
    hours REAL NOT NULL,
    rate_per_hour REAL,
    date TEXT NOT NULL,
    billed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id?: number;
  client: string;
  description: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  paidDate?: string;
  items?: InvoiceItem[];
  notes?: string;
  invoiceNumber?: string;
  createdAt: number;
}

export interface TimeEntry {
  id?: number;
  client: string;
  project?: string;
  description: string;
  hours: number;
  ratePerHour?: number;
  date: string;
  billed: boolean;
  createdAt: number;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export async function createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO invoices (client, description, amount, currency, status, issue_date, due_date, items, notes, invoice_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoice.client,
      invoice.description,
      invoice.amount,
      invoice.currency,
      invoice.status,
      invoice.issueDate,
      invoice.dueDate ?? null,
      invoice.items ? JSON.stringify(invoice.items) : null,
      invoice.notes ?? null,
      invoice.invoiceNumber ?? `INV-${Date.now()}`,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function markInvoicePaid(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE invoices SET status = 'paid', paid_date = ? WHERE id = ?`,
    [new Date().toISOString().slice(0, 10), id]
  );
}

export async function getInvoices(status?: InvoiceStatus): Promise<Invoice[]> {
  const db = await getDB();
  const rows = status
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM invoices WHERE status = ? ORDER BY issue_date DESC`, [status])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM invoices ORDER BY issue_date DESC`);

  return rows.map((r) => ({
    id: r.id,
    client: r.client,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    status: r.status as InvoiceStatus,
    issueDate: r.issue_date,
    dueDate: r.due_date ?? undefined,
    paidDate: r.paid_date ?? undefined,
    items: r.items ? JSON.parse(r.items) : undefined,
    notes: r.notes ?? undefined,
    invoiceNumber: r.invoice_number ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getOutstandingAmount(): Promise<{ total: number; count: number }> {
  const db = await getDB();
  const result = await db.getFirstAsync<{ total: number; count: number }>(
    `SELECT SUM(amount) as total, COUNT(*) as count FROM invoices WHERE status IN ('sent', 'overdue')`
  );
  return { total: result?.total ?? 0, count: result?.count ?? 0 };
}

// ─── Time tracking for billing ────────────────────────────────────────────────
export async function logBillableTime(entry: Omit<TimeEntry, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO time_entries (client, project, description, hours, rate_per_hour, date, billed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.client, entry.project ?? null, entry.description, entry.hours, entry.ratePerHour ?? null, entry.date, entry.billed ? 1 : 0, Date.now()]
  );
}

export async function getUnbilledTime(client?: string): Promise<{
  entries: TimeEntry[];
  totalHours: number;
  totalAmount: number;
}> {
  const db = await getDB();
  const rows = client
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM time_entries WHERE billed = 0 AND client = ? ORDER BY date DESC`, [client])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM time_entries WHERE billed = 0 ORDER BY date DESC`);

  const entries: TimeEntry[] = rows.map((r) => ({
    id: r.id,
    client: r.client,
    project: r.project ?? undefined,
    description: r.description,
    hours: r.hours,
    ratePerHour: r.rate_per_hour ?? undefined,
    date: r.date,
    billed: r.billed === 1,
    createdAt: r.created_at,
  }));

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const totalAmount = entries.reduce((s, e) => s + e.hours * (e.ratePerHour ?? 0), 0);

  return { entries, totalHours, totalAmount };
}

// ─── AI invoice generation ────────────────────────────────────────────────────
export async function generateInvoiceFromVoice(text: string, settings: Settings): Promise<Partial<Invoice>> {
  const prompt = `Extract invoice details from: "${text}"
Today: ${new Date().toISOString().slice(0, 10)}
Respond ONLY with JSON:
{
  "client": "client name",
  "description": "what was done",
  "amount": number,
  "currency": "ILS",
  "dueDate": "YYYY-MM-DD or null"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        ...parsed,
        status: 'draft' as InvoiceStatus,
        issueDate: new Date().toISOString().slice(0, 10),
      };
    }
  } catch {}

  return {
    status: 'draft',
    issueDate: new Date().toISOString().slice(0, 10),
    currency: 'ILS',
  };
}

export async function draftPaymentReminder(invoice: Invoice, settings: Settings): Promise<string> {
  const daysOverdue = invoice.dueDate
    ? Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000)
    : 0;

  const prompt = `Write a professional payment reminder:
Client: ${invoice.client}
Invoice: ${invoice.invoiceNumber ?? 'Invoice'}
Amount: ${invoice.amount} ${invoice.currency}
Due date: ${invoice.dueDate ?? 'not specified'}
${daysOverdue > 0 ? `Days overdue: ${daysOverdue}` : ''}

Write a firm but polite reminder email. Be professional, not aggressive.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
