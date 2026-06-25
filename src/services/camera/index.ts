import { CameraView } from 'expo-camera';
import { CameraConfig } from '@/store';

let cameraRef: CameraView | null = null;

export function setCameraRef(ref: CameraView | null) {
  cameraRef = ref;
}

// Capture a frame from the phone camera
export async function capturePhoneFrame(): Promise<string | null> {
  if (!cameraRef) return null;
  try {
    const photo = await cameraRef.takePictureAsync({
      quality: 0.5,
      base64: true,
      skipProcessing: true,
    });
    return photo?.base64 ?? null;
  } catch {
    return null;
  }
}

// Fetch a JPEG frame from a WiFi IP camera (MJPEG stream / snapshot URL)
export async function captureWifiFrame(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'image/jpeg' } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

export async function captureFrame(config: CameraConfig): Promise<string | null> {
  if (!config.active) return null;

  switch (config.type) {
    case 'phone':
      return capturePhoneFrame();
    case 'wifi':
      if (config.wifiUrl) return captureWifiFrame(config.wifiUrl);
      return null;
    case 'bluetooth':
      // Bluetooth camera images arrive via BLE notifications — handled in the BLE hook
      return null;
    default:
      return null;
  }
}
