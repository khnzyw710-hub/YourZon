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

// Default built-in keyword when no custom .ppn file is provided.
// Free tier includes: Alexa, Porcupine, Bumblebee, Terminator, Jarvis, etc.
const BUILTIN_KEYWORD = BuiltInKeyword.Porcupine;

const wakeWordCb = (onWakeWord: WakeWordCallback) => (keywordIndex: number) => {
  if (keywordIndex >= 0) onWakeWord();
};

const errorCb = (onError?: (err: string) => void) =>
  (error: PorcupineErrors.PorcupineError) => {
    onError?.(error.message);
  };

// ─── API ──────────────────────────────────────────────────────────────────────
export async function startPorcupine(
  accessKey: string,
  onWakeWord: WakeWordCallback,
  onError?: (err: string) => void,
  customKeywordPath?: string   // path to bundled .ppn file for custom wake word
): Promise<boolean> {
  if (_running) return true;

  try {
    if (customKeywordPath) {
      // Custom .ppn model (e.g. "היי זון" trained at console.picovoice.ai)
      _manager = await PorcupineManager.fromKeywordPaths(
        accessKey,
        [customKeywordPath],
        wakeWordCb(onWakeWord),
        errorCb(onError),
        [0.7]
      );
    } else {
      // Default built-in keyword — no model file needed
      _manager = await PorcupineManager.fromBuiltInKeywords(
        accessKey,
        [BUILTIN_KEYWORD],
        wakeWordCb(onWakeWord),
        errorCb(onError),
        [0.7]
      );
    }

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
