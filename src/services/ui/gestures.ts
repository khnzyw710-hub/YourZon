import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Gesture configuration ────────────────────────────────────────────────────
export type GestureAction =
  | 'start_listening'
  | 'stop_listening'
  | 'new_conversation'
  | 'open_settings'
  | 'open_memory'
  | 'toggle_mute'
  | 'scroll_up'
  | 'scroll_down'
  | 'none';

export type GestureType =
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up'
  | 'swipe_down'
  | 'double_tap'
  | 'long_press'
  | 'pinch'
  | 'two_finger_tap';

export interface GestureBinding {
  gesture: GestureType;
  action: GestureAction;
  label: string;
}

const DEFAULT_BINDINGS: GestureBinding[] = [
  { gesture: 'swipe_right', action: 'start_listening', label: 'התחל האזנה' },
  { gesture: 'swipe_left', action: 'stop_listening', label: 'עצור האזנה' },
  { gesture: 'swipe_up', action: 'open_memory', label: 'פתח זיכרון' },
  { gesture: 'swipe_down', action: 'new_conversation', label: 'שיחה חדשה' },
  { gesture: 'double_tap', action: 'toggle_mute', label: 'השתק/בטל השתקה' },
  { gesture: 'long_press', action: 'open_settings', label: 'פתח הגדרות' },
];

// ─── Gesture settings ─────────────────────────────────────────────────────────
export async function getGestureBindings(): Promise<GestureBinding[]> {
  try {
    const raw = await AsyncStorage.getItem('zon_gesture_bindings');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_BINDINGS;
}

export async function setGestureBinding(gesture: GestureType, action: GestureAction): Promise<void> {
  const bindings = await getGestureBindings();
  const idx = bindings.findIndex((b) => b.gesture === gesture);

  const actionLabels: Record<GestureAction, string> = {
    start_listening: 'התחל האזנה',
    stop_listening: 'עצור האזנה',
    new_conversation: 'שיחה חדשה',
    open_settings: 'פתח הגדרות',
    open_memory: 'פתח זיכרון',
    toggle_mute: 'השתק/בטל השתקה',
    scroll_up: 'גלול למעלה',
    scroll_down: 'גלול למטה',
    none: 'ללא פעולה',
  };

  const updated: GestureBinding = { gesture, action, label: actionLabels[action] };
  if (idx >= 0) bindings[idx] = updated;
  else bindings.push(updated);

  await AsyncStorage.setItem('zon_gesture_bindings', JSON.stringify(bindings));
}

export async function getActionForGesture(gesture: GestureType): Promise<GestureAction> {
  const bindings = await getGestureBindings();
  return bindings.find((b) => b.gesture === gesture)?.action ?? 'none';
}

export async function resetGestureBindings(): Promise<void> {
  await AsyncStorage.setItem('zon_gesture_bindings', JSON.stringify(DEFAULT_BINDINGS));
}

// ─── Haptic patterns ──────────────────────────────────────────────────────────
export type HapticIntensity = 'light' | 'medium' | 'heavy' | 'none';

export interface HapticSettings {
  enabled: boolean;
  onWakeWord: HapticIntensity;
  onResponse: HapticIntensity;
  onError: HapticIntensity;
  onGesture: HapticIntensity;
}

const DEFAULT_HAPTICS: HapticSettings = {
  enabled: true,
  onWakeWord: 'medium',
  onResponse: 'light',
  onError: 'heavy',
  onGesture: 'light',
};

export async function getHapticSettings(): Promise<HapticSettings> {
  try {
    const raw = await AsyncStorage.getItem('zon_haptic_settings');
    if (raw) return { ...DEFAULT_HAPTICS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_HAPTICS };
}

export async function updateHapticSettings(updates: Partial<HapticSettings>): Promise<void> {
  const current = await getHapticSettings();
  await AsyncStorage.setItem('zon_haptic_settings', JSON.stringify({ ...current, ...updates }));
}

// ─── UI animation settings ────────────────────────────────────────────────────
export interface AnimationSettings {
  enabled: boolean;
  orbAnimation: boolean;
  messageAnimations: boolean;
  transitionSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  reducedMotion: boolean;
}

const DEFAULT_ANIMATIONS: AnimationSettings = {
  enabled: true,
  orbAnimation: true,
  messageAnimations: true,
  transitionSpeed: 'normal',
  reducedMotion: false,
};

export async function getAnimationSettings(): Promise<AnimationSettings> {
  try {
    const raw = await AsyncStorage.getItem('zon_animation_settings');
    if (raw) return { ...DEFAULT_ANIMATIONS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_ANIMATIONS };
}

export async function updateAnimationSettings(updates: Partial<AnimationSettings>): Promise<void> {
  const current = await getAnimationSettings();
  await AsyncStorage.setItem('zon_animation_settings', JSON.stringify({ ...current, ...updates }));
}

export const TRANSITION_DURATIONS: Record<AnimationSettings['transitionSpeed'], number> = {
  slow: 500,
  normal: 250,
  fast: 100,
  instant: 0,
};
