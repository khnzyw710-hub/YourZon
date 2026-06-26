import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

// ─── Biometric auth ───────────────────────────────────────────────────────────
export async function isBiometricAvailable(): Promise<{
  available: boolean;
  type: 'fingerprint' | 'face' | 'iris' | 'none';
}> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: 'none' };

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: 'none' };

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let type: 'fingerprint' | 'face' | 'iris' | 'none' = 'none';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) type = 'face';
    else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) type = 'fingerprint';
    else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) type = 'iris';

    return { available: true, type };
  } catch {
    return { available: false, type: 'none' };
  }
}

export async function authenticateWithBiometric(reason = 'אמת את זהותך כדי להמשיך'): Promise<boolean> {
  try {
    const { available } = await isBiometricAvailable();
    if (!available) return true; // graceful fallback

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'השתמש בקוד גישה',
      cancelLabel: 'ביטול',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}

// ─── App lock ─────────────────────────────────────────────────────────────────
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

let _unlocked = false;
let _lastActivity = Date.now();
const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export function markActivity(): void {
  _lastActivity = Date.now();
}

export function isAutoLocked(): boolean {
  if (!_unlocked) return true;
  return Date.now() - _lastActivity > AUTO_LOCK_MS;
}

export function setUnlocked(unlocked: boolean): void {
  _unlocked = unlocked;
  if (unlocked) _lastActivity = Date.now();
}

export async function requireBiometricForSensitiveAction(action: string): Promise<boolean> {
  const authenticated = await authenticateWithBiometric(`אמת כדי לבצע: ${action}`);
  if (authenticated) setUnlocked(true);
  return authenticated;
}

// ─── PIN auth ─────────────────────────────────────────────────────────────────
async function hashPin(pin: string): Promise<string> {
  // Simple deterministicHash (for React Native without crypto module)
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0;
  }
  // Add a stored salt
  const salt = await SecureStore.getItemAsync('zon_pin_salt', SECURE_OPTS) ?? 'zon_default_salt_2024';
  let h2 = 0;
  const combined = h.toString() + salt;
  for (let i = 0; i < combined.length; i++) {
    h2 = (Math.imul(31, h2) + combined.charCodeAt(i)) | 0;
  }
  return Math.abs(h2).toString(36) + '_' + pin.length;
}

export async function setPIN(pin: string): Promise<void> {
  if (pin.length < 4) throw new Error('PIN must be at least 4 digits');
  // Generate a salt
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await SecureStore.setItemAsync('zon_pin_salt', salt, SECURE_OPTS);
  const hashed = await hashPin(pin);
  await SecureStore.setItemAsync('zon_pin_hash', hashed, SECURE_OPTS);
}

export async function verifyPIN(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync('zon_pin_hash', SECURE_OPTS);
  if (!stored) return true; // no PIN set = open
  const hashed = await hashPin(pin);
  return hashed === stored;
}

export async function hasPIN(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync('zon_pin_hash', SECURE_OPTS);
  return stored != null;
}

export async function clearPIN(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync('zon_pin_hash', SECURE_OPTS).catch(() => {}),
    SecureStore.deleteItemAsync('zon_pin_salt', SECURE_OPTS).catch(() => {}),
  ]);
}

// ─── Session management ───────────────────────────────────────────────────────
export interface Session {
  userId: string;
  startedAt: number;
  expiresAt: number;
  permissions: string[];
}

export async function createSession(userId: string, permissions: string[] = [], ttlMs = 8 * 3600000): Promise<Session> {
  const session: Session = {
    userId,
    startedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    permissions,
  };
  await SecureStore.setItemAsync('zon_session', JSON.stringify(session), SECURE_OPTS);
  return session;
}

export async function getSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync('zon_session', SECURE_OPTS);
    if (!raw) return null;
    const session: Session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      await clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync('zon_session', SECURE_OPTS).catch(() => {});
}
