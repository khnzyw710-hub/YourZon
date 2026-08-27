import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_security.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    description TEXT,
    severity TEXT DEFAULT 'low',
    ip_address TEXT,
    user_agent TEXT,
    resolved INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS auth_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT NOT NULL,
    success INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type SecurityEventType =
  | 'auth_failed'
  | 'auth_success'
  | 'vault_access'
  | 'data_export'
  | 'api_error'
  | 'unusual_activity'
  | 'app_start'
  | 'permission_denied';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id?: number;
  eventType: SecurityEventType;
  description?: string;
  severity: Severity;
  resolved: boolean;
  createdAt: number;
}

// ─── Log events ───────────────────────────────────────────────────────────────
export async function logSecurityEvent(
  eventType: SecurityEventType,
  description?: string,
  severity: Severity = 'low'
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO security_events (event_type, description, severity, resolved, created_at) VALUES (?, ?, ?, 0, ?)`,
      [eventType, description ?? null, severity, Date.now()]
    );
  } catch {}
}

export async function logAuthAttempt(method: string, success: boolean): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO auth_attempts (method, success, created_at) VALUES (?, ?, ?)`,
      [method, success ? 1 : 0, Date.now()]
    );

    if (!success) {
      const recent = await getRecentFailedAttempts(method, 5);
      if (recent >= 5) {
        await logSecurityEvent('auth_failed', `${recent} failed ${method} attempts`, 'high');
      }
    }
  } catch {}
}

// ─── Query events ─────────────────────────────────────────────────────────────
export async function getSecurityEvents(limit = 50, severity?: Severity): Promise<SecurityEvent[]> {
  const db = await getDB();
  const rows = severity
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM security_events WHERE severity = ? ORDER BY created_at DESC LIMIT ?`, [severity, limit])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM security_events ORDER BY created_at DESC LIMIT ?`, [limit]);

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type as SecurityEventType,
    description: r.description ?? undefined,
    severity: r.severity as Severity,
    resolved: r.resolved === 1,
    createdAt: r.created_at,
  }));
}

async function getRecentFailedAttempts(method: string, windowMin = 60): Promise<number> {
  const db = await getDB();
  const since = Date.now() - windowMin * 60 * 1000;
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM auth_attempts WHERE method = ? AND success = 0 AND created_at > ?`,
    [method, since]
  );
  return result?.count ?? 0;
}

export async function getSecuritySummary(): Promise<{
  totalEvents: number;
  criticalEvents: number;
  failedAuthAttempts: number;
  lastActivity: number | null;
  riskLevel: 'low' | 'medium' | 'high';
}> {
  try {
    const db = await getDB();
    const since = Date.now() - 7 * 86400000; // last 7 days

    const [total, critical, failedAuth, last] = await Promise.all([
      db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM security_events WHERE created_at > ?`, [since]),
      db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM security_events WHERE severity = 'critical' AND created_at > ?`, [since]),
      db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM auth_attempts WHERE success = 0 AND created_at > ?`, [since]),
      db.getFirstAsync<{ created_at: number }>(`SELECT created_at FROM security_events ORDER BY created_at DESC LIMIT 1`),
    ]);

    const criticalCount = critical?.count ?? 0;
    const failedCount = failedAuth?.count ?? 0;
    const riskLevel: 'low' | 'medium' | 'high' =
      criticalCount > 0 || failedCount > 10 ? 'high' : failedCount > 3 ? 'medium' : 'low';

    return {
      totalEvents: total?.count ?? 0,
      criticalEvents: criticalCount,
      failedAuthAttempts: failedCount,
      lastActivity: last?.created_at ?? null,
      riskLevel,
    };
  } catch {
    return { totalEvents: 0, criticalEvents: 0, failedAuthAttempts: 0, lastActivity: null, riskLevel: 'low' };
  }
}

// ─── Brute force protection ───────────────────────────────────────────────────
const _lockouts: Record<string, { until: number; attempts: number }> = {};

export function isLockedOut(identifier: string): boolean {
  const lockout = _lockouts[identifier];
  if (!lockout) return false;
  if (Date.now() > lockout.until) {
    delete _lockouts[identifier];
    return false;
  }
  return true;
}

export function recordFailedAttempt(identifier: string): { locked: boolean; cooldownMs: number } {
  if (!_lockouts[identifier]) {
    _lockouts[identifier] = { until: 0, attempts: 0 };
  }
  _lockouts[identifier].attempts++;

  const attempts = _lockouts[identifier].attempts;
  let cooldownMs = 0;

  if (attempts >= 10) {
    cooldownMs = 30 * 60 * 1000; // 30 min
  } else if (attempts >= 5) {
    cooldownMs = 60 * 1000; // 1 min
  } else if (attempts >= 3) {
    cooldownMs = 10 * 1000; // 10 sec
  }

  if (cooldownMs > 0) {
    _lockouts[identifier].until = Date.now() + cooldownMs;
  }

  return { locked: cooldownMs > 0, cooldownMs };
}

export function clearLockout(identifier: string): void {
  delete _lockouts[identifier];
}
