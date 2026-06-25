// Lightweight language detection for TTS routing
// No external library needed — pattern-based detection covers Hebrew/English/Arabic

export type DetectedLanguage = 'he-IL' | 'en-US' | 'ar-SA' | 'ru-RU' | 'fr-FR' | 'es-ES';

const PATTERNS: Array<{ lang: DetectedLanguage; regex: RegExp }> = [
  { lang: 'he-IL', regex: /[֐-׿]/ },
  { lang: 'ar-SA', regex: /[؀-ۿ]/ },
  { lang: 'ru-RU', regex: /[Ѐ-ӿ]/ },
  {
    lang: 'fr-FR',
    regex: /\b(le|la|les|un|une|des|je|tu|il|nous|vous|ils|est|et|en|pour|avec|dans)\b/i,
  },
  {
    lang: 'es-ES',
    regex: /\b(el|la|los|las|un|una|es|en|de|que|con|por|para|como|muy)\b/i,
  },
];

export function detectLanguage(text: string): DetectedLanguage {
  for (const { lang, regex } of PATTERNS) {
    if (regex.test(text)) return lang;
  }
  return 'en-US';
}

export function getVoiceForLanguage(lang: DetectedLanguage): string {
  // expo-speech language codes
  return lang;
}

// Adjust TTS language per detected language
export function getTTSOptions(text: string, baseRate: number) {
  const lang = detectLanguage(text);
  return { language: lang, rate: baseRate };
}
