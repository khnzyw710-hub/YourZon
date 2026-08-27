// Language auto-detection — detects mid-sentence language switches between
// Hebrew and English and triggers recognition language change.

export type DetectedLang = 'he-IL' | 'en-US' | 'mixed';

interface LangWindow {
  lang: DetectedLang;
  ts: number;
  confidence: number;
}

const WINDOW_MS = 15000; // 15s sliding window
let _history: LangWindow[] = [];
let _currentLang: DetectedLang = 'he-IL';
let _onLangChange: ((lang: DetectedLang) => void) | null = null;

// ─── Simple character-ratio detection ────────────────────────────────────────
export function detectLanguage(text: string): { lang: DetectedLang; confidence: number } {
  if (!text || text.trim().length === 0) return { lang: 'he-IL', confidence: 0.5 };

  const clean = text.replace(/[\d\s\p{P}]/gu, '');
  if (clean.length === 0) return { lang: _currentLang, confidence: 0.5 };

  const hebrewCount = (clean.match(/[֐-׿]/g) ?? []).length;
  const latinCount = (clean.match(/[a-zA-Z]/g) ?? []).length;
  const total = hebrewCount + latinCount;

  if (total === 0) return { lang: _currentLang, confidence: 0.5 };

  const hebrewRatio = hebrewCount / total;

  if (hebrewRatio > 0.75) return { lang: 'he-IL', confidence: hebrewRatio };
  if (hebrewRatio < 0.25) return { lang: 'en-US', confidence: 1 - hebrewRatio };
  return { lang: 'mixed', confidence: 0.5 };
}

// ─── Feed transcript and detect switches ──────────────────────────────────────
export function feedTranscript(text: string): DetectedLang | null {
  const { lang, confidence } = detectLanguage(text);
  if (confidence < 0.6) return null;

  const now = Date.now();
  _history = _history.filter((w) => now - w.ts < WINDOW_MS);
  _history.push({ lang, ts: now, confidence });

  // Need at least 3 consistent samples to switch
  if (_history.length < 3) return null;

  const recent = _history.slice(-3);
  const allSame = recent.every((w) => w.lang === recent[0]!.lang);
  if (!allSame) return null;

  const newLang = recent[0]!.lang === 'mixed' ? _currentLang : recent[0]!.lang;
  if (newLang !== _currentLang) {
    _currentLang = newLang;
    _onLangChange?.(newLang);
    return newLang;
  }

  return null;
}

export function setLangChangeCallback(cb: (lang: DetectedLang) => void): void {
  _onLangChange = cb;
}

export function getCurrentLang(): DetectedLang {
  return _currentLang;
}

export function resetLangDetection(): void {
  _history = [];
  _currentLang = 'he-IL';
}

// ─── Get recognition locale string ───────────────────────────────────────────
export function getRecognitionLocale(lang: DetectedLang): string {
  if (lang === 'en-US') return 'en-US';
  return 'he-IL';
}
