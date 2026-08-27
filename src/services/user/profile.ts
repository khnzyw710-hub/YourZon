// User Profile — name, gender, age, occupation, language preference.
// Drives Hebrew grammatical gender in AI responses and TTS voice selection.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'zon_user_profile';

export type UserGender = 'male' | 'female' | 'neutral';
export type ResponseLength = 'short' | 'medium' | 'detailed';
export type FormalityLevel = 'casual' | 'formal' | 'friendly';

export interface UserProfile {
  name: string;
  gender: UserGender;
  age: number | null;
  occupation: string;
  language: 'he' | 'en' | 'auto';
  responseLength: ResponseLength;
  formality: FormalityLevel;
  interests: string[];
  dislikedTopics: string[];
  customPersonaPrompt: string;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  gender: 'neutral',
  age: null,
  occupation: '',
  language: 'auto',
  responseLength: 'medium',
  formality: 'friendly',
  interests: [],
  dislikedTopics: [],
  customPersonaPrompt: '',
};

export async function loadUserProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
  const current = await loadUserProfile();
  const updated = { ...current, ...profile };
  await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  return updated;
}

// ─── Build AI system prompt from profile ─────────────────────────────────────
export function buildProfileSystemPrompt(profile: UserProfile): string {
  const parts: string[] = [];

  // Identity
  if (profile.name) {
    parts.push(`שם המשתמש: ${profile.name}.`);
  }

  // Hebrew gender grammar
  if (profile.gender === 'male') {
    parts.push(
      `דבר עם המשתמש בגוף שני זכר בעברית. ` +
      `השתמש בצורות כמו "עשית", "הלכת", "יכולת", "אתה". ` +
      `In English use "he/him" and address as "man".`
    );
  } else if (profile.gender === 'female') {
    parts.push(
      `דבר עם המשתמשת בגוף שני נקבה בעברית. ` +
      `השתמש בצורות כמו "עשית", "הלכת", "יכולת", "את". ` +
      `In English use "she/her" and address accordingly.`
    );
  }

  // Age/occupation context
  if (profile.age) parts.push(`גיל: ${profile.age}.`);
  if (profile.occupation) parts.push(`עיסוק: ${profile.occupation}.`);

  // Response style
  const lengthMap: Record<ResponseLength, string> = {
    short: 'ענה בקצרה — משפט עד שניים. ללא הסברים מיותרים.',
    medium: 'ענה בצורה ממוקדת — 2-4 משפטים.',
    detailed: 'ענה בפירוט מלא. הסבר צעד אחרי צעד.',
  };
  parts.push(lengthMap[profile.responseLength]);

  // Formality
  const formalityMap: Record<FormalityLevel, string> = {
    casual: 'דבר בגובה העיניים, סלנג מותר, הרגש חופשי.',
    formal: 'דבר בצורה מקצועית ומכובדת.',
    friendly: 'דבר בחום ובגישה חברית.',
  };
  parts.push(formalityMap[profile.formality]);

  // Interests
  if (profile.interests.length > 0) {
    parts.push(`תחומי עניין: ${profile.interests.join(', ')}.`);
  }

  // Custom override
  if (profile.customPersonaPrompt) {
    parts.push(profile.customPersonaPrompt);
  }

  return parts.join(' ');
}

// ─── Greeting by gender ───────────────────────────────────────────────────────
export function getGenderedGreeting(profile: UserProfile): string {
  const name = profile.name ? ` ${profile.name}` : '';
  if (profile.gender === 'female') return `שלום${name}! מה את צריכה היום?`;
  if (profile.gender === 'male') return `שלום${name}! מה אתה צריך היום?`;
  return `שלום${name}! איך אוכל לעזור?`;
}
