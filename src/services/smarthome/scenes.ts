import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { controlDevice, getDevices } from './devices';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_smarthome.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏠',
    actions TEXT NOT NULL,
    trigger_time TEXT,
    trigger_conditions TEXT,
    use_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS automations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_value TEXT,
    scene_id INTEGER,
    actions TEXT,
    enabled INTEGER DEFAULT 1,
    last_triggered INTEGER,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SceneAction {
  deviceId: number;
  action: 'on' | 'off' | 'dim' | 'temperature' | 'color';
  value?: string | number;
}

export interface Scene {
  id?: number;
  name: string;
  icon: string;
  actions: SceneAction[];
  triggerTime?: string;
  triggerConditions?: Record<string, any>;
  useCount: number;
  createdAt: number;
}

export interface Automation {
  id?: number;
  name: string;
  triggerType: 'time' | 'location' | 'voice' | 'sensor' | 'sunrise' | 'sunset';
  triggerValue?: string;
  sceneId?: number;
  actions?: SceneAction[];
  enabled: boolean;
  lastTriggered?: number;
  createdAt: number;
}

// ─── Built-in scenes ──────────────────────────────────────────────────────────
export const DEFAULT_SCENES: Omit<Scene, 'id' | 'createdAt' | 'useCount'>[] = [
  { name: 'בוקר טוב', icon: '🌅', actions: [], triggerTime: '07:00' },
  { name: 'ריכוז', icon: '🎯', actions: [] },
  { name: 'סרט', icon: '🎬', actions: [] },
  { name: 'שינה', icon: '🌙', actions: [], triggerTime: '22:30' },
  { name: 'יציאה', icon: '🚪', actions: [] },
  { name: 'חזרה הביתה', icon: '🏠', actions: [] },
  { name: 'רומנטי', icon: '💕', actions: [] },
  { name: 'חגיגה', icon: '🎉', actions: [] },
];

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function saveScene(scene: Omit<Scene, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO scenes (name, icon, actions, trigger_time, trigger_conditions, use_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      scene.name,
      scene.icon,
      JSON.stringify(scene.actions),
      scene.triggerTime ?? null,
      scene.triggerConditions ? JSON.stringify(scene.triggerConditions) : null,
      scene.useCount ?? 0,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function getScenes(): Promise<Scene[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM scenes ORDER BY use_count DESC, name`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    actions: JSON.parse(r.actions ?? '[]'),
    triggerTime: r.trigger_time ?? undefined,
    triggerConditions: r.trigger_conditions ? JSON.parse(r.trigger_conditions) : undefined,
    useCount: r.use_count,
    createdAt: r.created_at,
  }));
}

export async function activateScene(sceneId: number): Promise<{ success: number; failed: number }> {
  const db = await getDB();
  const scene = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM scenes WHERE id = ?`, [sceneId]);
  if (!scene) return { success: 0, failed: 0 };

  const actions: SceneAction[] = JSON.parse(scene.actions ?? '[]');
  let success = 0;
  let failed = 0;

  await Promise.all(
    actions.map(async (a) => {
      const ok = await controlDevice(a.deviceId, a.action, a.value);
      if (ok) success++; else failed++;
    })
  );

  await db.runAsync(`UPDATE scenes SET use_count = use_count + 1 WHERE id = ?`, [sceneId]);
  return { success, failed };
}

// ─── AI scene builder ─────────────────────────────────────────────────────────
export async function buildSceneFromDescription(description: string, settings: Settings): Promise<Scene> {
  const devices = await getDevices();
  const deviceList = devices.map((d) => `ID:${d.id} "${d.name}" (${d.type}, ${d.room ?? 'unknown'})`).join('\n');

  const prompt = `Create a smart home scene for: "${description}"
Available devices:
${deviceList}

Respond with JSON:
{
  "name": "scene name in Hebrew",
  "icon": "single emoji",
  "actions": [{"deviceId": number, "action": "on|off|dim|temperature|color", "value": number_or_string_or_null}]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { ...parsed, useCount: 0, createdAt: Date.now() };
    }
  } catch {}

  return { name: description, icon: '🏠', actions: [], useCount: 0, createdAt: Date.now() };
}

// ─── Automations ──────────────────────────────────────────────────────────────
export async function saveAutomation(auto: Omit<Automation, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO automations (name, trigger_type, trigger_value, scene_id, actions, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [auto.name, auto.triggerType, auto.triggerValue ?? null, auto.sceneId ?? null, auto.actions ? JSON.stringify(auto.actions) : null, auto.enabled ? 1 : 0, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getAutomations(): Promise<Automation[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM automations ORDER BY name`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    triggerType: r.trigger_type as Automation['triggerType'],
    triggerValue: r.trigger_value ?? undefined,
    sceneId: r.scene_id ?? undefined,
    actions: r.actions ? JSON.parse(r.actions) : undefined,
    enabled: r.enabled === 1,
    lastTriggered: r.last_triggered ?? undefined,
    createdAt: r.created_at,
  }));
}
