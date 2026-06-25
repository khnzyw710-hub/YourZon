import * as Speech from 'expo-speech';

let _isSpeaking = false;

export function isSpeaking() {
  return _isSpeaking;
}

export async function speak(
  text: string,
  rate = 1.0,
  onDone?: () => void
): Promise<void> {
  if (_isSpeaking) {
    await Speech.stop();
  }

  _isSpeaking = true;

  Speech.speak(text, {
    language: 'he-IL',
    rate,
    onDone: () => {
      _isSpeaking = false;
      onDone?.();
    },
    onError: () => {
      _isSpeaking = false;
      onDone?.();
    },
  });
}

export async function stopSpeaking() {
  _isSpeaking = false;
  await Speech.stop();
}
