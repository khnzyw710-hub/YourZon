// OpenAI TTS — highest quality text-to-speech using tts-1-hd model.
// Plays audio via expo-av. Supports 6 voice profiles + gender selection.

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export const VOICE_LABELS: Record<OpenAIVoice, string> = {
  alloy: 'Alloy (ניטרלי)',
  echo: 'Echo (זכר, מעמיק)',
  fable: 'Fable (זכר, בריטי)',
  onyx: 'Onyx (זכר, נמוך)',
  nova: 'Nova (נקבה, טבעי)',
  shimmer: 'Shimmer (נקבה, רך)',
};

export const GENDER_VOICE_MAP: Record<'male' | 'female' | 'neutral', OpenAIVoice> = {
  male: 'onyx',
  female: 'nova',
  neutral: 'alloy',
};

let _sound: Audio.Sound | null = null;
let _isSpeaking = false;

export async function speakOpenAI(
  text: string,
  apiKey: string,
  voice: OpenAIVoice = 'alloy',
  speed = 1.0,
  onDone?: () => void
): Promise<void> {
  if (!apiKey || !text.trim()) {
    onDone?.();
    return;
  }

  try {
    // Stop any current playback
    if (_sound) {
      await _sound.stopAsync().catch(() => {});
      await _sound.unloadAsync().catch(() => {});
      _sound = null;
    }

    _isSpeaking = true;

    // Request from OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice,
        speed: Math.max(0.25, Math.min(4.0, speed)),
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    // Save to temp file and play
    const blob = await response.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const fileUri = `${FileSystem.cacheDirectory}zon_tts_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Configure audio session
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: fileUri },
      { shouldPlay: true, volume: 1.0, rate: 1.0 }
    );
    _sound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        _isSpeaking = false;
        sound.unloadAsync().catch(() => {});
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        onDone?.();
      }
    });
  } catch (err) {
    _isSpeaking = false;
    onDone?.();
  }
}

export async function stopOpenAITTS(): Promise<void> {
  _isSpeaking = false;
  if (_sound) {
    await _sound.stopAsync().catch(() => {});
    await _sound.unloadAsync().catch(() => {});
    _sound = null;
  }
}

export function isOpenAITTSSpeaking(): boolean {
  return _isSpeaking;
}
