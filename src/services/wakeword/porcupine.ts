import {
  BuiltInKeyword,
  PorcupineManager,
  PorcupineErrors,
} from '@picovoice/porcupine-react-native';

// ─── Types ─────────────────────────────────────────────────────────────────────
export type WakeWordCallback = () => void;

// ─── State ────────────────────────────────────────────────────────────────────
let _manager: PorcupineManager | null = null;
let _running = false;

// ─── Built-in keywords map ────────────────────────────────────────────────────
// Porcupine free tier includes: Alexa, Bumblebee, Computer, Hey Google, Hey Siri,
// Jarvis, Ok Google, Picovoice, Porcupine, Terminator
// For a custom Hebrew wake word ("היי זון") the user needs a Picovoice Console account.
// We default to "Porcupine" (built-in) so the code runs without a custom model.
const BUILTIN_KEYWORD = BuiltInKeyword.Porcupine;

// ─── API ──────────────────────────────────────────────────────────────────────
export async function startPorcupine(
  accessKey: string,
  onWakeWord: WakeWordCallback,
  onError?: (err: string) => void,
  customKeywordPath?: string   // path to .ppn file for custom word
): Promise<boolean> {
  if (_running) return true;

  try {
    const keywordConfig = customKeywordPath
      ? { keywordPath: customKeywordPath, sensitivity: 0.7 }
      : { keyword: BUILTIN_KEYWORD, sensitivity: 0.7 };

    _manager = await PorcupineManager.fromBuiltInKeywords(
      accessKey,
      [BUILTIN_KEYWORD],
      (keywordIndex: number) => {
        if (keywordIndex >= 0) onWakeWord();
      },
      (error: PorcupineErrors.PorcupineError) => {
        onError?.(error.message);
      }
    );

    await _manager.start();
    _running = true;
    return true;
  } catch (err: any) {
    onError?.(`Porcupine init error: ${err?.message ?? err}`);
    return false;
  }
}

export async function stopPorcupine() {
  if (_manager) {
    await _manager.stop();
    await _manager.delete();
    _manager = null;
  }
  _running = false;
}

export function isPorcupineRunning() {
  return _running;
}

// ─── Graceful fallback ────────────────────────────────────────────────────────
// If no Picovoice key is provided, the app falls back to the JS keyword-match
// approach already in useListening.ts (handled by the consumer of this service).
export function hasPorcupineKey(key: string | undefined): key is string {
  return typeof key === 'string' && key.trim().length > 10;
}
