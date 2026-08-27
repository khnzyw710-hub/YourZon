import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { speakOpenAI, stopOpenAITTS } from '@/services/tts/openai';

let _isSpeaking = false;
let _sound: Audio.Sound | null = null;

export function isSpeaking() {
  return _isSpeaking;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────
async function speakElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string,
  onDone?: () => void
): Promise<void> {
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) throw new Error(`EL ${res.status}`);

    // Decode mp3 to base64 data URI for expo-av
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const uri = `data:audio/mpeg;base64,${base64}`;

    if (_sound) {
      await _sound.unloadAsync();
      _sound = null;
    }

    const { sound } = await Audio.Sound.createAsync({ uri });
    _sound = sound;
    _isSpeaking = true;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        _isSpeaking = false;
        sound.unloadAsync();
        if (_sound === sound) _sound = null;
        onDone?.();
      }
    });

    await sound.playAsync();
  } catch {
    // Fall back to expo-speech
    speakNative(text, 1.0, onDone);
  }
}

// ─── Native TTS (expo-speech fallback) ───────────────────────────────────────
function speakNative(text: string, rate: number, onDone?: () => void) {
  _isSpeaking = true;
  Speech.speak(text, {
    language: 'he-IL',
    rate,
    onDone: () => { _isSpeaking = false; onDone?.(); },
    onError: () => { _isSpeaking = false; onDone?.(); },
  });
}

// ─── Unified speak ────────────────────────────────────────────────────────────
export async function speak(
  text: string,
  rate = 1.0,
  onDone?: () => void,
  elevenLabsKey?: string,
  voiceId = 'EXAVITQu4vr4xnSDxMaL',   // default: "Bella" multilingual voice
  openaiKey?: string,
  openaiVoice = 'alloy'
): Promise<void> {
  if (_isSpeaking) await stopSpeaking();

  if (openaiKey) {
    await speakOpenAI(text, openaiKey, openaiVoice as any, rate, onDone);
  } else if (elevenLabsKey) {
    await speakElevenLabs(text, elevenLabsKey, voiceId, onDone);
  } else {
    speakNative(text, rate, onDone);
  }
}

export async function stopSpeaking(): Promise<void> {
  _isSpeaking = false;
  await Speech.stop();
  await stopOpenAITTS();
  if (_sound) {
    await _sound.stopAsync().catch(() => {});
    await _sound.unloadAsync().catch(() => {});
    _sound = null;
  }
}
