import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_smarthome.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    room TEXT,
    brand TEXT,
    ip_address TEXT,
    api_endpoint TEXT,
    state TEXT DEFAULT '{}',
    is_on INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS device_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    value TEXT,
    triggered_by TEXT DEFAULT 'manual',
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type DeviceType = 'light' | 'thermostat' | 'lock' | 'camera' | 'speaker' | 'tv' | 'fan' | 'blinds' | 'plug' | 'sensor' | 'other';

export interface Device {
  id?: number;
  name: string;
  type: DeviceType;
  room?: string;
  brand?: string;
  ipAddress?: string;
  apiEndpoint?: string;
  state: Record<string, any>;
  isOn: boolean;
  createdAt: number;
}

export interface DeviceAction {
  deviceId: number;
  action: 'on' | 'off' | 'toggle' | 'set' | 'dim' | 'color' | 'temperature';
  value?: string | number;
  triggeredBy?: string;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function addDevice(device: Omit<Device, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO devices (name, type, room, brand, ip_address, api_endpoint, state, is_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [device.name, device.type, device.room ?? null, device.brand ?? null, device.ipAddress ?? null, device.apiEndpoint ?? null, JSON.stringify(device.state), device.isOn ? 1 : 0, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getDevices(room?: string): Promise<Device[]> {
  const db = await getDB();
  const rows = room
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM devices WHERE room = ? ORDER BY name`, [room])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM devices ORDER BY room, name`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as DeviceType,
    room: r.room ?? undefined,
    brand: r.brand ?? undefined,
    ipAddress: r.ip_address ?? undefined,
    apiEndpoint: r.api_endpoint ?? undefined,
    state: JSON.parse(r.state ?? '{}'),
    isOn: r.is_on === 1,
    createdAt: r.created_at,
  }));
}

export async function updateDeviceState(id: number, state: Record<string, any>, isOn?: boolean): Promise<void> {
  const db = await getDB();
  if (isOn !== undefined) {
    await db.runAsync(`UPDATE devices SET state = ?, is_on = ? WHERE id = ?`, [JSON.stringify(state), isOn ? 1 : 0, id]);
  } else {
    await db.runAsync(`UPDATE devices SET state = ? WHERE id = ?`, [JSON.stringify(state), id]);
  }
}

export async function logDeviceAction(action: DeviceAction): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO device_log (device_id, action, value, triggered_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    [action.deviceId, action.action, action.value?.toString() ?? null, action.triggeredBy ?? 'manual', Date.now()]
  );
}

// ─── Device control ───────────────────────────────────────────────────────────
export async function controlDevice(deviceId: number, action: DeviceAction['action'], value?: string | number): Promise<boolean> {
  const db = await getDB();
  const device = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM devices WHERE id = ?`, [deviceId]);
  if (!device) return false;

  const state = JSON.parse(device.state ?? '{}');
  let isOn = device.is_on === 1;

  switch (action) {
    case 'on': isOn = true; state.on = true; break;
    case 'off': isOn = false; state.on = false; break;
    case 'toggle': isOn = !isOn; state.on = isOn; break;
    case 'dim': if (value != null) { state.brightness = Number(value); isOn = Number(value) > 0; } break;
    case 'temperature': if (value != null) state.temperature = Number(value); break;
    case 'color': if (value) state.color = value; break;
    case 'set': if (value) state.value = value; break;
  }

  await updateDeviceState(deviceId, state, isOn);
  await logDeviceAction({ deviceId, action, value, triggeredBy: 'voice' });

  // If device has a real API endpoint, try to call it
  if (device.api_endpoint) {
    try {
      await fetch(device.api_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value, state }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {}
  }

  return true;
}

// ─── Voice command parsing ────────────────────────────────────────────────────
export async function parseVoiceDeviceCommand(text: string, settings: Settings): Promise<{
  deviceName: string;
  action: DeviceAction['action'];
  value?: string | number;
} | null> {
  const devices = await getDevices();
  if (devices.length === 0) return null;

  const deviceNames = devices.map((d) => `${d.name} (${d.room ?? 'unknown room'})`).join(', ');
  const prompt = `Parse smart home command: "${text}"
Available devices: ${deviceNames}

Respond ONLY with JSON or null:
{"deviceName": "exact device name", "action": "on|off|toggle|dim|temperature|color|set", "value": number_or_string_or_null}

If no device command detected, respond: null`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    if (response.trim().toLowerCase() === 'null') return null;
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}

export async function getRooms(): Promise<string[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ room: string }>(`SELECT DISTINCT room FROM devices WHERE room IS NOT NULL ORDER BY room`);
  return rows.map((r) => r.room);
}

export async function getDevicesByRoom(): Promise<Record<string, Device[]>> {
  const devices = await getDevices();
  const byRoom: Record<string, Device[]> = {};
  for (const d of devices) {
    const room = d.room ?? 'Other';
    if (!byRoom[room]) byRoom[room] = [];
    byRoom[room].push(d);
  }
  return byRoom;
}
