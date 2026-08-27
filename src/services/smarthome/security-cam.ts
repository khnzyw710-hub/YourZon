import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Security camera & doorbell integration ───────────────────────────────────
// Connects to local RTSP streams and popular camera brands via REST/API

export type CameraProtocol = 'rtsp' | 'http_mjpeg' | 'hls' | 'webrtc';
export type CameraStatus = 'online' | 'offline' | 'recording' | 'motion_detected';

export interface SecurityCamera {
  id: string;
  name: string;
  location: string;
  protocol: CameraProtocol;
  streamUrl: string;
  thumbnailUrl?: string;
  status: CameraStatus;
  motionSensitivity: 0 | 1 | 2 | 3;
  recordingEnabled: boolean;
  brand?: string;
  authToken?: string;
}

export interface MotionEvent {
  cameraId: string;
  cameraName: string;
  timestamp: string;
  thumbnailUrl?: string;
  duration?: number;
}

// ─── Camera management ────────────────────────────────────────────────────────

const _cameras: Map<string, SecurityCamera> = new Map();

export function registerCamera(camera: SecurityCamera): void {
  _cameras.set(camera.id, camera);
}

export function getCameras(): SecurityCamera[] {
  return Array.from(_cameras.values());
}

export function getCameraById(id: string): SecurityCamera | null {
  return _cameras.get(id) ?? null;
}

export async function getCameraStatus(camera: SecurityCamera): Promise<CameraStatus> {
  try {
    const testUrl = camera.thumbnailUrl ?? camera.streamUrl.replace('/stream', '/snapshot');
    const headers: Record<string, string> = {};
    if (camera.authToken) headers['Authorization'] = `Bearer ${camera.authToken}`;

    const res = await fetch(testUrl, { method: 'HEAD', headers, signal: AbortSignal.timeout(3000) });
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

// ─── Motion event handling ────────────────────────────────────────────────────

const _motionEvents: MotionEvent[] = [];
const _motionListeners: Array<(event: MotionEvent) => void> = [];

export function onMotionDetected(listener: (event: MotionEvent) => void): () => void {
  _motionListeners.push(listener);
  return () => {
    const idx = _motionListeners.indexOf(listener);
    if (idx >= 0) _motionListeners.splice(idx, 1);
  };
}

export function triggerMotionEvent(event: MotionEvent): void {
  _motionEvents.unshift(event);
  if (_motionEvents.length > 100) _motionEvents.pop();
  _motionListeners.forEach((l) => l(event));
}

export function getRecentMotionEvents(limit = 20): MotionEvent[] {
  return _motionEvents.slice(0, limit);
}

// ─── Snapshot fetching ────────────────────────────────────────────────────────

export async function fetchSnapshot(camera: SecurityCamera): Promise<string | null> {
  if (!camera.thumbnailUrl) return null;
  try {
    const headers: Record<string, string> = {};
    if (camera.authToken) headers['Authorization'] = `Bearer ${camera.authToken}`;
    const res = await fetch(camera.thumbnailUrl, { headers });
    if (!res.ok) return null;
    // Return URL — actual image display handled by Image component
    return camera.thumbnailUrl;
  } catch {
    return null;
  }
}

// ─── AI security analysis ─────────────────────────────────────────────────────

export async function generateSecurityReport(events: MotionEvent[], settings: Settings): Promise<string> {
  if (events.length === 0) return 'No motion events recorded.';

  const summary = events.slice(0, 20).map((e) =>
    `${new Date(e.timestamp).toLocaleString('he-IL')}: Motion at ${e.cameraName}${e.duration ? ` (${e.duration}s)` : ''}`
  ).join('\n');

  const prompt = `Analyze security camera events for the past period:
${summary}

Provide:
1. Pattern analysis (timing, frequency, which cameras)
2. Risk assessment (normal activity vs. potential concern)
3. Recommended actions if any
4. Suggested camera settings adjustments`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Doorbell integration ─────────────────────────────────────────────────────

export interface DoorbellEvent {
  timestamp: string;
  snapshotUrl?: string;
  callerName?: string;
  answered: boolean;
}

const _doorbellEvents: DoorbellEvent[] = [];

export function logDoorbellEvent(event: DoorbellEvent): void {
  _doorbellEvents.unshift(event);
  if (_doorbellEvents.length > 50) _doorbellEvents.pop();
}

export function getDoorbellHistory(): DoorbellEvent[] {
  return _doorbellEvents.slice();
}

// ─── Visitor announcement ─────────────────────────────────────────────────────

export async function generateVisitorAnnouncement(
  event: DoorbellEvent,
  settings: Settings
): Promise<string> {
  if (event.callerName) {
    return `${event.callerName} is at the door`;
  }
  const time = new Date(event.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `מישהו בדלת בשעה ${time}`;
}
