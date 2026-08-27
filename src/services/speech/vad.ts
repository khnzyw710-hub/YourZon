// Voice Activity Detection using @mykin-ai/expo-audio-stream
// Falls back to energy-threshold approach if native VAD unavailable.
import { AudioStreamModule } from '@mykin-ai/expo-audio-stream';

export type VADEvent = 'voice_start' | 'voice_end' | 'silence';

type VADCallback = (event: VADEvent, audioChunk?: string) => void;

let _running = false;
let _callback: VADCallback | null = null;

const SILENCE_DB = -38;          // dBFS threshold — below this = silence
const VOICE_HOLD_MS = 600;       // stay in "speaking" for at least 600ms before declaring end
const SILENCE_CONFIRM_MS = 1800; // must be silent for 1.8s before voice_end fires

let _voiceHoldTimer: ReturnType<typeof setTimeout> | null = null;
let _silenceTimer: ReturnType<typeof setTimeout> | null = null;
let _speaking = false;
let _audioBuffer = '';

export async function startVAD(callback: VADCallback): Promise<void> {
  if (_running) return;
  _callback = callback;
  _running = true;

  try {
    await AudioStreamModule.startRecording({
      sampleRate: 16000,
      channelConfig: 'CHANNEL_IN_MONO',
      audioFormat: 'ENCODING_PCM_16BIT',
      interval: 100,             // emit audio chunks every 100ms
      enableProcessing: true,
      vadEnabled: true,
    } as any);

    AudioStreamModule.addListener('AudioData', (event: any) => {
      if (!_running) return;

      const dbLevel: number = event.dBLevel ?? event.energy ?? -60;
      const chunk: string = event.encoded ?? '';

      if (dbLevel > SILENCE_DB) {
        // Voice detected
        _audioBuffer += chunk;

        if (!_speaking) {
          clearTimeout(_silenceTimer!);
          _voiceHoldTimer = setTimeout(() => {
            _speaking = true;
            _callback?.('voice_start');
          }, VOICE_HOLD_MS);
        } else {
          clearTimeout(_silenceTimer!);
          _silenceTimer = setTimeout(() => {
            _speaking = false;
            const finalChunk = _audioBuffer;
            _audioBuffer = '';
            _callback?.('voice_end', finalChunk);
          }, SILENCE_CONFIRM_MS);
        }
      } else {
        // Silence
        clearTimeout(_voiceHoldTimer!);
        if (!_speaking) {
          _callback?.('silence');
        }
      }
    });
  } catch {
    // Native VAD unavailable — consumer falls back to fixed timer
    _running = false;
  }
}

export async function stopVAD(): Promise<void> {
  _running = false;
  _callback = null;
  clearTimeout(_voiceHoldTimer!);
  clearTimeout(_silenceTimer!);
  _speaking = false;
  _audioBuffer = '';
  try {
    await AudioStreamModule.stopRecording();
    // removeAllListeners is optional in some versions of the module
    (AudioStreamModule as any).removeAllListeners?.('AudioData');
  } catch {}
}

export function isVADRunning() {
  return _running;
}
