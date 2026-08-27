import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Advanced translation service ────────────────────────────────────────────
// Supports Hebrew ↔ English + cultural adaptation, formal/informal variants

export type SupportedLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'de' | 'zh' | 'ja' | 'pt';
export type TranslationTone = 'formal' | 'informal' | 'business' | 'academic' | 'simple' | 'poetic';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  he: 'Hebrew (עברית)',
  en: 'English',
  ar: 'Arabic (عربي)',
  ru: 'Russian (Русский)',
  fr: 'French (Français)',
  es: 'Spanish (Español)',
  de: 'German (Deutsch)',
  zh: 'Chinese (中文)',
  ja: 'Japanese (日本語)',
  pt: 'Portuguese (Português)',
};

export interface TranslationResult {
  original: string;
  translated: string;
  fromLang: SupportedLanguage;
  toLang: SupportedLanguage;
  tone?: TranslationTone;
  alternativeTranslations?: string[];
  culturalNotes?: string;
  backTranslation?: string;
}

export async function translate(
  text: string,
  toLang: SupportedLanguage,
  fromLang?: SupportedLanguage,
  tone: TranslationTone = 'formal',
  settings: Settings
): Promise<TranslationResult> {
  const fromClause = fromLang ? `from ${LANGUAGE_NAMES[fromLang]}` : '(auto-detect source language)';

  const prompt = `Translate ${fromClause} to ${LANGUAGE_NAMES[toLang]}.
Tone: ${tone}
Text: "${text}"

Respond with JSON:
{
  "translated": "translation",
  "detectedFromLang": "he|en|ar|ru|fr|es|de|zh|ja|pt",
  "alternativeTranslations": ["alt1", "alt2"],
  "culturalNotes": "any cultural adaptation needed or null",
  "backTranslation": "translate your translation back to the original language (to verify accuracy)"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        original: text,
        translated: parsed.translated,
        fromLang: parsed.detectedFromLang ?? fromLang ?? 'en',
        toLang,
        tone,
        alternativeTranslations: parsed.alternativeTranslations ?? [],
        culturalNotes: parsed.culturalNotes ?? undefined,
        backTranslation: parsed.backTranslation ?? undefined,
      };
    }
  } catch {}

  return {
    original: text,
    translated: text,
    fromLang: fromLang ?? 'en',
    toLang,
  };
}

export async function detectLanguage(text: string, settings: Settings): Promise<SupportedLanguage> {
  // Fast heuristics
  if (/[֐-׿]/.test(text)) return 'he';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';

  const prompt = `Detect the language of: "${text.slice(0, 200)}"
Respond with ONLY the language code: he|en|ar|ru|fr|es|de|zh|ja|pt`;

  const { response } = await routeToAI(prompt, [], settings);
  const code = response.trim().toLowerCase() as SupportedLanguage;
  return LANGUAGE_NAMES[code] ? code : 'en';
}

export async function translateBatch(
  texts: string[],
  toLang: SupportedLanguage,
  settings: Settings
): Promise<string[]> {
  if (texts.length === 0) return [];

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `Translate these items to ${LANGUAGE_NAMES[toLang]}. Keep numbering.
${numbered}

Respond with JSON array: ["translation1", "translation2", ...]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === texts.length) return parsed;
    }
  } catch {}

  return texts;
}

export async function localizeForCulture(
  content: string,
  targetCountry: string,
  targetLanguage: SupportedLanguage,
  settings: Settings
): Promise<{ localized: string; changes: string[] }> {
  const prompt = `Localize this content for ${targetCountry}:
"${content}"

Target language: ${LANGUAGE_NAMES[targetLanguage]}
Consider: cultural references, date/number formats, units, idioms, local humor or formality norms.

Respond with JSON:
{
  "localized": "culturally adapted translation",
  "changes": ["list of specific adaptations made"]
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { localized: content, changes: [] };
}

export async function explainIdiom(
  idiom: string,
  sourceLang: SupportedLanguage,
  settings: Settings
): Promise<{
  literal: string;
  meaning: string;
  equivalent: string;
  example: string;
}> {
  const prompt = `Explain the ${LANGUAGE_NAMES[sourceLang]} idiom: "${idiom}"

Respond with JSON:
{
  "literal": "word-for-word translation",
  "meaning": "what it actually means",
  "equivalent": "closest English equivalent idiom",
  "example": "example sentence using the idiom in context"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { literal: idiom, meaning: idiom, equivalent: idiom, example: idiom };
}
