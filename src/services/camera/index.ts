import { CameraView } from 'expo-camera';
import { CameraConfig } from '@/store';
import { quickDescribeImage } from '@/services/ai/gemini';

// ─── Camera ref management ────────────────────────────────────────────────────
let cameraRef: CameraView | null = null;
let _sceneContext = '';
let _sceneUpdateTimer: ReturnType<typeof setInterval> | null = null;

export function setCameraRef(ref: CameraView | null) {
  cameraRef = ref;
}

export function getSceneContext(): string {
  return _sceneContext;
}

// ─── Capture a frame from phone camera ───────────────────────────────────────
export async function capturePhoneFrame(): Promise<string | null> {
  if (!cameraRef) return null;
  try {
    const photo = await cameraRef.takePictureAsync({
      quality: 0.4,
      base64: true,
      skipProcessing: true,
      shutterSound: false,
    } as any);
    return photo?.base64 ?? null;
  } catch {
    return null;
  }
}

// ─── WiFi IP Camera ───────────────────────────────────────────────────────────
export async function captureWifiFrame(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/jpeg' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return null;
  }
}

// ─── BLE Camera frame (injected by bluetooth service) ────────────────────────
let _bleFrame: string | null = null;
export function setBLEFrame(base64: string | null) {
  _bleFrame = base64;
}

// ─── Unified capture ─────────────────────────────────────────────────────────
export async function captureFrame(config: CameraConfig): Promise<string | null> {
  if (!config.active) return null;
  switch (config.type) {
    case 'phone':
      return capturePhoneFrame();
    case 'wifi':
      return config.wifiUrl ? captureWifiFrame(config.wifiUrl) : null;
    case 'bluetooth':
      return _bleFrame;
    default:
      return null;
  }
}

// ─── Continuous scene understanding (passive mode) ────────────────────────────
export function startSceneMonitor(config: CameraConfig, geminiKey: string, intervalMs = 3000) {
  stopSceneMonitor();
  if (!config.active || !geminiKey) return;

  _sceneUpdateTimer = setInterval(async () => {
    const frame = await captureFrame(config);
    if (frame) {
      const desc = await quickDescribeImage(frame, geminiKey).catch(() => '');
      if (desc) _sceneContext = desc;
    }
  }, intervalMs);
}

export function stopSceneMonitor() {
  if (_sceneUpdateTimer) {
    clearInterval(_sceneUpdateTimer);
    _sceneUpdateTimer = null;
  }
  _sceneContext = '';
}
