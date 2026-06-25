import { BleManager, Device, State } from 'react-native-ble-plx';
import { setBLEFrame } from './index';

// ─── BLE Camera Service UUIDs ─────────────────────────────────────────────────
// These are common UUIDs used by wearable cameras. Adjust per device spec.
const CAMERA_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const FRAME_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
const TRIGGER_CHARACTERISTIC_UUID = '0000ffe2-0000-1000-8000-00805f9b34fb';

// ─── State ────────────────────────────────────────────────────────────────────
let _manager: BleManager | null = null;
let _device: Device | null = null;
let _connected = false;
let _frameBuffer = '';
let _onStatusChange: ((connected: boolean, error?: string) => void) | null = null;

function getManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

// ─── Scan for BLE cameras ─────────────────────────────────────────────────────
export async function scanForCameras(
  onFound: (device: { id: string; name: string }) => void,
  timeoutMs = 10000
): Promise<void> {
  const manager = getManager();
  const state = await manager.state();
  if (state !== State.PoweredOn) {
    throw new Error('Bluetooth is not enabled');
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      resolve();
    }, timeoutMs);

    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) return;
      if (!device || !device.name) return;
      // Filter for likely camera devices
      if (
        device.name.toLowerCase().includes('cam') ||
        device.name.toLowerCase().includes('zon') ||
        device.name.toLowerCase().includes('eye') ||
        device.serviceUUIDs?.includes(CAMERA_SERVICE_UUID)
      ) {
        onFound({ id: device.id, name: device.name });
      }
    });
  });
}

// ─── Connect to BLE camera ────────────────────────────────────────────────────
export async function connectBLECamera(
  deviceId: string,
  onStatusChange: (connected: boolean, error?: string) => void
): Promise<void> {
  _onStatusChange = onStatusChange;
  const manager = getManager();

  try {
    _device = await manager.connectToDevice(deviceId, {
      autoConnect: true,
      requestMTU: 512,
    });
    await _device.discoverAllServicesAndCharacteristics();

    _device.onDisconnected(() => {
      _connected = false;
      setBLEFrame(null);
      _onStatusChange?.(false);
    });

    // Subscribe to frame notifications
    _device.monitorCharacteristicForService(
      CAMERA_SERVICE_UUID,
      FRAME_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;

        // Frames arrive in chunks; accumulate until we get a complete JPEG
        _frameBuffer += characteristic.value;

        // JPEG ends with FF D9
        if (_frameBuffer.includes('/9j/') || _frameBuffer.length > 50000) {
          setBLEFrame(_frameBuffer);
          _frameBuffer = '';
        }
      }
    );

    _connected = true;
    onStatusChange(true);
  } catch (err: any) {
    _connected = false;
    onStatusChange(false, err?.message ?? 'Connection failed');
  }
}

// ─── Trigger a capture on the camera ─────────────────────────────────────────
export async function triggerBLECapture(): Promise<void> {
  if (!_device || !_connected) return;
  try {
    await _device.writeCharacteristicWithResponseForService(
      CAMERA_SERVICE_UUID,
      TRIGGER_CHARACTERISTIC_UUID,
      btoa('\x01')
    );
  } catch {}
}

export async function disconnectBLECamera(): Promise<void> {
  if (_device) {
    await _device.cancelConnection().catch(() => {});
    _device = null;
  }
  _connected = false;
  setBLEFrame(null);
}

export function isBLEConnected() {
  return _connected;
}

export async function destroyBLEManager(): Promise<void> {
  await disconnectBLECamera();
  _manager?.destroy();
  _manager = null;
}
