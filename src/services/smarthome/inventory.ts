import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_smarthome.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'units',
    min_quantity REAL DEFAULT 1,
    location TEXT,
    barcode TEXT,
    expiry_date TEXT,
    auto_reorder INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS shopping_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'units',
    category TEXT,
    priority INTEGER DEFAULT 2,
    checked INTEGER DEFAULT 0,
    added_by TEXT DEFAULT 'manual',
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InventoryItem {
  id?: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  location?: string;
  barcode?: string;
  expiryDate?: string;
  autoReorder: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ShoppingItem {
  id?: number;
  itemName: string;
  quantity: number;
  unit: string;
  category?: string;
  priority: 1 | 2 | 3;
  checked: boolean;
  addedBy: string;
  createdAt: number;
}

// ─── Inventory CRUD ───────────────────────────────────────────────────────────
export async function addInventoryItem(item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO inventory (name, category, quantity, unit, min_quantity, location, barcode, expiry_date, auto_reorder, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.name, item.category, item.quantity, item.unit, item.minQuantity, item.location ?? null, item.barcode ?? null, item.expiryDate ?? null, item.autoReorder ? 1 : 0, now, now]
  );
  return result.lastInsertRowId;
}

export async function updateQuantity(id: number, newQuantity: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?`, [newQuantity, Date.now(), id]);
}

export async function consumeItem(id: number, amount: number): Promise<void> {
  const db = await getDB();
  const item = await db.getFirstAsync<{ quantity: number; min_quantity: number; auto_reorder: number; name: string }>(
    `SELECT quantity, min_quantity, auto_reorder, name FROM inventory WHERE id = ?`, [id]
  );
  if (!item) return;

  const newQty = Math.max(0, item.quantity - amount);
  await db.runAsync(`UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?`, [newQty, Date.now(), id]);

  // Auto-add to shopping list if below minimum
  if (newQty <= item.min_quantity && item.auto_reorder) {
    await addToShoppingList({ itemName: item.name, quantity: item.min_quantity * 2 - newQty, unit: 'units', addedBy: 'auto-reorder', priority: 2, checked: false, createdAt: Date.now() });
  }
}

export async function getInventory(category?: string): Promise<InventoryItem[]> {
  const db = await getDB();
  const rows = category
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM inventory WHERE category = ? ORDER BY name`, [category])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM inventory ORDER BY category, name`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    quantity: r.quantity,
    unit: r.unit,
    minQuantity: r.min_quantity,
    location: r.location ?? undefined,
    barcode: r.barcode ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    autoReorder: r.auto_reorder === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getLowStockItems(): Promise<InventoryItem[]> {
  const items = await getInventory();
  return items.filter((i) => i.quantity <= i.minQuantity);
}

export async function getExpiringItems(days = 7): Promise<InventoryItem[]> {
  const items = await getInventory();
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return items.filter((i) => i.expiryDate && i.expiryDate <= cutoff);
}

// ─── Shopping list ────────────────────────────────────────────────────────────
export async function addToShoppingList(item: Omit<ShoppingItem, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO shopping_list (item_name, quantity, unit, category, priority, checked, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.itemName, item.quantity, item.unit, item.category ?? null, item.priority, item.checked ? 1 : 0, item.addedBy, item.createdAt]
  );
  return result.lastInsertRowId;
}

export async function getShoppingList(includeChecked = false): Promise<ShoppingItem[]> {
  const db = await getDB();
  const rows = includeChecked
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM shopping_list ORDER BY checked ASC, priority ASC, category`)
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM shopping_list WHERE checked = 0 ORDER BY priority ASC, category`);

  return rows.map((r) => ({
    id: r.id,
    itemName: r.item_name,
    quantity: r.quantity,
    unit: r.unit,
    category: r.category ?? undefined,
    priority: r.priority as ShoppingItem['priority'],
    checked: r.checked === 1,
    addedBy: r.added_by,
    createdAt: r.created_at,
  }));
}

export async function checkShoppingItem(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE shopping_list SET checked = 1 WHERE id = ?`, [id]);
}

export async function clearCheckedItems(): Promise<void> {
  const db = await getDB();
  await db.runAsync(`DELETE FROM shopping_list WHERE checked = 1`);
}

// ─── AI grocery features ──────────────────────────────────────────────────────
export async function generateShoppingListFromMeals(meals: string[], settings: Settings): Promise<string[]> {
  const prompt = `Generate a grocery shopping list for these meals:
${meals.join('\n')}

List ingredients needed, one per line. Include approximate quantities. Group by category (produce, dairy, meat, etc.).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 2);
}

export async function addVoiceShoppingItems(text: string, settings: Settings): Promise<string[]> {
  const prompt = `Extract grocery items from: "${text}"
List each item on its own line with quantity. Example: "2 kg tomatoes"
If no items found, return empty.`;

  const { response } = await routeToAI(prompt, [], settings);
  const items = response.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
  return items;
}
