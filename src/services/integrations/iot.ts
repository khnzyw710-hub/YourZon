import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── IoT protocol integrations ────────────────────────────────────────────────
// ZON connects to home IoT via REST (local network) and MQTT-over-WebSocket
// No cloud dependency — everything runs on the local network

export type IoTProtocol = 'rest' | 'mqtt' | 'z_wave' | 'zigbee' | 'matter';
export type IoTDeviceClass = 'light' | 'switch' | 'sensor' | 'thermostat' | 'lock' | 'camera' | 'fan' | 'cover';

export interface IoTDevice {
  id: string;
  name: string;
  deviceClass: IoTDeviceClass;
  protocol: IoTProtocol;
  endpoint: string;
  authToken?: string;
  state: Record<string, any>;
  lastSeenAt: number;
}

export interface IoTCommandResult {
  success: boolean;
  device: string;
  command: string;
  newState?: Record<string, any>;
  error?: string;
}

// ─── REST device control ──────────────────────────────────────────────────────

export async function sendRestCommand(
  device: IoTDevice,
  command: string,
  params: Record<string, any> = {}
): Promise<IoTCommandResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (device.authToken) headers['Authorization'] = `Bearer ${device.authToken}`;

    const res = await fetch(`${device.endpoint}/${command}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const newState = await res.json().catch(() => ({}));
    return { success: true, device: device.name, command, newState };
  } catch (e: any) {
    return { success: false, device: device.name, command, error: e.message };
  }
}

export async function pollDeviceState(device: IoTDevice): Promise<Record<string, any> | null> {
  try {
    const headers: Record<string, string> = {};
    if (device.authToken) headers['Authorization'] = `Bearer ${device.authToken}`;

    const res = await fetch(`${device.endpoint}/state`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Home Assistant integration (most common Israeli smart home hub) ──────────

export interface HAConfig {
  baseUrl: string;
  accessToken: string;
}

export async function getHAEntities(config: HAConfig): Promise<Array<{
  entityId: string;
  friendlyName: string;
  state: string;
  domain: string;
}>> {
  try {
    const res = await fetch(`${config.baseUrl}/api/states`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!res.ok) return [];
    const states = await res.json() as Array<Record<string, any>>;
    return states.map((s) => ({
      entityId: s.entity_id,
      friendlyName: s.attributes?.friendly_name ?? s.entity_id,
      state: s.state,
      domain: s.entity_id.split('.')[0],
    }));
  } catch {
    return [];
  }
}

export async function callHAService(
  config: HAConfig,
  domain: string,
  service: string,
  serviceData: Record<string, any>
): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseUrl}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serviceData),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Voice command → IoT action ───────────────────────────────────────────────

export async function parseIoTVoiceCommand(
  transcript: string,
  availableDevices: Array<{ id: string; name: string; deviceClass: IoTDeviceClass }>,
  settings: Settings
): Promise<{
  deviceId: string;
  command: string;
  params: Record<string, any>;
} | null> {
  const deviceList = availableDevices.map((d) => `${d.id}: ${d.name} (${d.deviceClass})`).join('\n');

  const prompt = `Parse IoT voice command: "${transcript}"
Available devices:
${deviceList}

Respond with JSON or null:
{
  "deviceId": "device id from the list",
  "command": "on|off|set|toggle|dim|lock|unlock|open|close",
  "params": {"brightness": 50, "color": "red", "temperature": 22, ...}
}

null if no device command detected.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    if (response.trim().toLowerCase() === 'null') return null;
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return null;
}

// ─── Smart home automation rules ─────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  trigger: {
    type: 'time' | 'device_state' | 'location' | 'sunrise' | 'sunset';
    value: string;
  };
  conditions: Array<{ deviceId: string; state: string }>;
  actions: Array<{ deviceId: string; command: string; params: Record<string, any> }>;
  enabled: boolean;
}

export async function generateAutomationFromDescription(
  description: string,
  devices: Array<{ id: string; name: string; deviceClass: IoTDeviceClass }>,
  settings: Settings
): Promise<Partial<AutomationRule>> {
  const deviceList = devices.map((d) => `${d.id}: ${d.name} (${d.deviceClass})`).join('\n');

  const prompt = `Design a smart home automation for: "${description}"
Available devices:
${deviceList}

Respond with JSON:
{
  "name": "automation name",
  "trigger": {"type": "time|device_state|sunrise|sunset", "value": "HH:MM or entity_id or condition"},
  "actions": [{"deviceId": "id", "command": "on|off|set", "params": {}}]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { ...parsed, id: Date.now().toString(36), enabled: true, conditions: [] };
    }
  } catch {}

  return {};
}

// ─── Energy monitoring ────────────────────────────────────────────────────────

export async function getSmartPlugConsumption(deviceEndpoint: string): Promise<{
  wattsNow: number;
  kwhToday: number;
  voltageV: number;
} | null> {
  try {
    const res = await fetch(`${deviceEndpoint}/power`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
