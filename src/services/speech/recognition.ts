import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import { SPEECH_SESSION_TIMEOUT_MS } from '@/constants';

export type RecognitionCallback = (transcript: string, isFinal: boolean) => void;
export type ErrorCallback = (error: string) => void;

let sessionRestartTimer: ReturnType<typeof setTimeout> | null = null;
let _onTranscript: RecognitionCallback | null = null;
let _onError: ErrorCallback | null = null;
let _isRunning = false;

export function isRecognitionRunning() {
  return _isRunning;
}

export async function startContinuousRecognition(
  onTranscript: RecognitionCallback,
  onError: ErrorCallback,
  lang = 'he-IL'
) {
  _onTranscript = onTranscript;
  _onError = onError;

  const hasPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!hasPermission.granted) {
    onError('Microphone permission denied');
    return;
  }

  _startSession(lang);
}

function _startSession(lang: string) {
  clearTimeout(sessionRestartTimer!);

  const options: ExpoSpeechRecognitionOptions = {
    lang,
    interimResults: true,
    continuous: true,
    requiresOnDeviceRecognition: false,
    addsPunctuation: true,
  };

  ExpoSpeechRecognitionModule.start(options);
  _isRunning = true;

  // iOS SFSpeechRecognizer has a ~60s limit per session — restart before it expires
  sessionRestartTimer = setTimeout(() => {
    if (_isRunning) {
      ExpoSpeechRecognitionModule.stop();
      setTimeout(() => _startSession(lang), 300);
    }
  }, SPEECH_SESSION_TIMEOUT_MS);
}

export function stopContinuousRecognition() {
  _isRunning = false;
  clearTimeout(sessionRestartTimer!);
  ExpoSpeechRecognitionModule.stop();
  _onTranscript = null;
  _onError = null;
}

// Hook-based event wiring (call inside a component)
export function useRecognitionEvents() {
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    const isFinal = event.isFinal ?? false;
    _onTranscript?.(transcript, isFinal);
  });

  useSpeechRecognitionEvent('error', (event) => {
    _onError?.(event.message ?? 'Speech recognition error');
    // Auto-restart on errors that aren't fatal
    if (_isRunning) {
      setTimeout(() => _startSession('he-IL'), 500);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    // Restarted by the session timer above, but guard against unexpected ends
    if (_isRunning) {
      setTimeout(() => _startSession('he-IL'), 300);
    }
  });
}
