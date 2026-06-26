import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { requireBiometricForSensitiveAction } from './auth';

// ─── Secure vault for passwords and sensitive data ────────────────────────────
// All vault data is stored with expo-secure-store (iOS Keychain / Android Keystore)
// SQLite only stores non-sensitive metadata (name, category, created_at)

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_vault_meta.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    has_username INTEGER DEFAULT 0,
    has_password INTEGER DEFAULT 0,
    has_note INTEGER DEFAULT 0,
    url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type VaultCategory = 'login' | 'credit_card' | 'bank' | 'note' | 'identity' | 'other';

export interface VaultItem {
  id: string;
  name: string;
  category: VaultCategory;
  username?: string;
  password?: string;
  note?: string;
  url?: string;
  createdAt: number;
  updatedAt: number;
}

function makeVaultId(): string {
  return 'vault_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Vault CRUD ───────────────────────────────────────────────────────────────
export async function addVaultItem(item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const authenticated = await requireBiometricForSensitiveAction('שמירת פריט בכספת');
  if (!authenticated) throw new Error('Authentication required');

  const id = makeVaultId();
  const now = Date.now();

  // Store sensitive data in Keychain/Keystore
  if (item.username) await SecureStore.setItemAsync(`${id}_username`, item.username, SECURE_OPTS);
  if (item.password) await SecureStore.setItemAsync(`${id}_password`, item.password, SECURE_OPTS);
  if (item.note) await SecureStore.setItemAsync(`${id}_note`, item.note, SECURE_OPTS);

  // Store metadata in SQLite
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO vault_items (id, name, category, has_username, has_password, has_note, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      item.name,
      item.category,
      item.username ? 1 : 0,
      item.password ? 1 : 0,
      item.note ? 1 : 0,
      item.url ?? null,
      now,
      now,
    ]
  );

  return id;
}

export async function getVaultItem(id: string): Promise<VaultItem | null> {
  const authenticated = await requireBiometricForSensitiveAction('גישה לכספת');
  if (!authenticated) return null;

  const db = await getDB();
  const meta = await db.getFirstAsync<{
    id: string; name: string; category: string; has_username: number;
    has_password: number; has_note: number; url: string | null; created_at: number; updated_at: number;
  }>(`SELECT * FROM vault_items WHERE id = ?`, [id]);

  if (!meta) return null;

  const [username, password, note] = await Promise.all([
    meta.has_username ? SecureStore.getItemAsync(`${id}_username`, SECURE_OPTS) : Promise.resolve(null),
    meta.has_password ? SecureStore.getItemAsync(`${id}_password`, SECURE_OPTS) : Promise.resolve(null),
    meta.has_note ? SecureStore.getItemAsync(`${id}_note`, SECURE_OPTS) : Promise.resolve(null),
  ]);

  return {
    id: meta.id,
    name: meta.name,
    category: meta.category as VaultCategory,
    username: username ?? undefined,
    password: password ?? undefined,
    note: note ?? undefined,
    url: meta.url ?? undefined,
    createdAt: meta.created_at,
    updatedAt: meta.updated_at,
  };
}

export async function listVaultItems(): Promise<Array<{ id: string; name: string; category: VaultCategory; url?: string }>> {
  const authenticated = await requireBiometricForSensitiveAction('פתיחת כספת');
  if (!authenticated) return [];

  const db = await getDB();
  const rows = await db.getAllAsync<{ id: string; name: string; category: string; url: string | null }>(
    `SELECT id, name, category, url FROM vault_items ORDER BY category, name`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as VaultCategory,
    url: r.url ?? undefined,
  }));
}

export async function deleteVaultItem(id: string): Promise<void> {
  const authenticated = await requireBiometricForSensitiveAction('מחיקת פריט מהכספת');
  if (!authenticated) return;

  const db = await getDB();
  await db.runAsync(`DELETE FROM vault_items WHERE id = ?`, [id]);

  // Delete from secure store
  await Promise.all([
    SecureStore.deleteItemAsync(`${id}_username`, SECURE_OPTS).catch(() => {}),
    SecureStore.deleteItemAsync(`${id}_password`, SECURE_OPTS).catch(() => {}),
    SecureStore.deleteItemAsync(`${id}_note`, SECURE_OPTS).catch(() => {}),
  ]);
}

// ─── Password generator ───────────────────────────────────────────────────────
export function generatePassword(params: {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}): string {
  const { length = 16, uppercase = true, lowercase = true, numbers = true, symbols = true } = params;

  let chars = '';
  if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (numbers) chars += '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

export function assessPasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  suggestions: string[];
} {
  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8) score++;
  else suggestions.push('Use at least 8 characters');
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  else suggestions.push('Add uppercase letters');
  if (/[0-9]/.test(password)) score++;
  else suggestions.push('Add numbers');
  if (/[^A-Za-z0-9]/.test(password)) score++;
  else suggestions.push('Add special characters');

  const finalScore = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels: Array<'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong'> = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return { score: finalScore, label: labels[finalScore], suggestions };
}
