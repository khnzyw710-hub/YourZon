import * as Speech from 'expo-speech';
import * as SecureStore from 'expo-secure-store';
import { Settings } from '@/store';

// ─── TTS queue with priority, cancellation, and voice selection ────────────────

export type TTSPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TTSVoiceProvider = 'native' | 'elevenlabs' | 'openai';

export interface TTSJob {
  id: string;
  text: string;
  priority: TTSPriority;
  provider?: TTSVoiceProvider;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  onError?: (error: string) => void;
}

const PRIORITY_ORDER: Record<TTSPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

class TTSQueue {
  private queue: TTSJob[] = [];
  private speaking = false;
  private currentJob: TTSJob | null = null;

  enqueue(job: TTSJob): void {
    this.queue.push(job);
    this.queue.sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
    if (!this.speaking) this._processNext();
  }

  cancel(id: string): void {
    this.queue = this.queue.filter((j) => j.id !== id);
    if (this.currentJob?.id === id) {
      Speech.stop();
      this.speaking = false;
      this.currentJob = null;
      this._processNext();
    }
  }

  cancelAll(): void {
    this.queue = [];
    this.currentJob = null;
    Speech.stop();
    this.speaking = false;
  }

  get isActive(): boolean {
    return this.speaking || this.queue.length > 0;
  }

  private async _processNext(): Promise<void> {
    if (this.queue.length === 0 || this.speaking) return;

    const job = this.queue.shift()!;
    this.currentJob = job;
    this.speaking = true;

    try {
      await this._speak(job);
      job.onDone?.();
    } catch (e: any) {
      job.onError?.(e?.message ?? 'TTS error');
    } finally {
      this.speaking = false;
      this.currentJob = null;
      this._processNext();
    }
  }

  private async _speak(job: TTSJob): Promise<void> {
    return new Promise((resolve, reject) => {
      const text = job.text.slice(0, 4000);

      Speech.speak(text, {
        rate: job.rate ?? 1.0,
        pitch: job.pitch ?? 1.0,
        language: 'he-IL',
        onDone: () => resolve(),
        onError: (err) => reject(err),
        onStopped: () => resolve(),
      });
    });
  }
}

export const ttsQueue = new TTSQueue();

// ─── Convenience functions ────────────────────────────────────────────────────

let _globalJobCounter = 0;

export function speakNow(text: string, opts?: { rate?: number; pitch?: number; onDone?: () => void }): string {
  ttsQueue.cancelAll();
  const id = `tts-${++_globalJobCounter}`;
  ttsQueue.enqueue({ id, text, priority: 'urgent', rate: opts?.rate, pitch: opts?.pitch, onDone: opts?.onDone });
  return id;
}

export function speakQueued(text: string, priority: TTSPriority = 'normal', opts?: { rate?: number; onDone?: () => void }): string {
  const id = `tts-${++_globalJobCounter}`;
  ttsQueue.enqueue({ id, text, priority, rate: opts?.rate, onDone: opts?.onDone });
  return id;
}

export function stopTTS(): void {
  ttsQueue.cancelAll();
}

export function pauseTTS(): void {
  Speech.pause();
}

export function resumeTTS(): void {
  Speech.resume();
}

// ─── Voice settings persistence ───────────────────────────────────────────────

export interface VoicePreferences {
  rate: number;
  pitch: number;
  provider: TTSVoiceProvider;
  openaiVoice: string;
  elevenLabsVoiceId: string;
}

const VOICE_PREFS_KEY = 'zon_voice_prefs';

export async function saveVoicePreferences(prefs: VoicePreferences): Promise<void> {
  await SecureStore.setItemAsync(VOICE_PREFS_KEY, JSON.stringify(prefs));
}

export async function loadVoicePreferences(): Promise<VoicePreferences> {
  const raw = await SecureStore.getItemAsync(VOICE_PREFS_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }
  return {
    rate: 1.0,
    pitch: 1.0,
    provider: 'native',
    openaiVoice: 'nova',
    elevenLabsVoiceId: '',
  };
}

// ─── Available system voices ──────────────────────────────────────────────────

export async function getAvailableVoices(): Promise<Speech.Voice[]> {
  return Speech.getAvailableVoicesAsync();
}

export async function getHebrewVoices(): Promise<Speech.Voice[]> {
  const voices = await getAvailableVoices();
  return voices.filter((v) => v.language?.startsWith('he'));
}

// ─── Advanced TTS: chapter / long-form reading ────────────────────────────────

export function splitIntoChunks(text: string, maxChars = 500): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export function readLongText(
  text: string,
  onProgress?: (chunkIndex: number, total: number) => void
): { cancel: () => void } {
  const chunks = splitIntoChunks(text, 500);
  let cancelled = false;

  const enqueueAll = () => {
    chunks.forEach((chunk, i) => {
      const id = `long-${++_globalJobCounter}`;
      ttsQueue.enqueue({
        id,
        text: chunk,
        priority: 'normal',
        onDone: () => {
          if (!cancelled) onProgress?.(i + 1, chunks.length);
        },
      });
    });
  };

  enqueueAll();
  return { cancel: () => { cancelled = true; ttsQueue.cancelAll(); } };
}
