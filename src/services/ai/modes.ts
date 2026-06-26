import { Settings } from '@/store';
import { routeToAI, routeToAIStream } from '@/services/ai/router';

// ─── AI Session Modes ─────────────────────────────────────────────────────────
export type AIMode =
  | 'standard'
  | 'focus'          // distraction-free, concise responses
  | 'deep_research'  // thorough, multi-angle analysis
  | 'creative'       // open-ended, imaginative, exploratory
  | 'socratic'       // guides with questions, helps user think
  | 'devil_advocate' // challenges assumptions
  | 'explain_simple' // ELI5 — explain like I'm 5
  | 'expert'         // assumes deep domain knowledge
  | 'hebrew_only'    // force Hebrew responses
  | 'bullet_only';   // always respond in bullet points

export interface ModeConfig {
  systemPrefix: string;
  maxTokensHint: number;
  temperature: number;
  label: string;
  icon: string;
}

export const MODE_CONFIGS: Record<AIMode, ModeConfig> = {
  standard: {
    systemPrefix: '',
    maxTokensHint: 1000,
    temperature: 0.7,
    label: 'Standard',
    icon: '🤖',
  },
  focus: {
    systemPrefix: 'Respond in 1-3 concise sentences only. No preamble. No caveats.',
    maxTokensHint: 150,
    temperature: 0.3,
    label: 'Focus',
    icon: '🎯',
  },
  deep_research: {
    systemPrefix: 'Analyze this thoroughly from multiple angles. Include pros/cons, edge cases, and alternative viewpoints. Be comprehensive.',
    maxTokensHint: 2000,
    temperature: 0.5,
    label: 'Deep Research',
    icon: '🔬',
  },
  creative: {
    systemPrefix: 'Be imaginative, unconventional, and exploratory. Think outside the box. Surprise and delight.',
    maxTokensHint: 1500,
    temperature: 0.95,
    label: 'Creative',
    icon: '🎨',
  },
  socratic: {
    systemPrefix: 'Guide the user with insightful questions rather than giving direct answers. Help them think through the problem themselves. Ask one probing question at a time.',
    maxTokensHint: 300,
    temperature: 0.6,
    label: 'Socratic',
    icon: '🦉',
  },
  devil_advocate: {
    systemPrefix: 'Challenge the premise of the question. Point out weaknesses in assumptions. Argue the opposite of what the user expects. Be intellectually provocative but fair.',
    maxTokensHint: 800,
    temperature: 0.8,
    label: "Devil's Advocate",
    icon: '😈',
  },
  explain_simple: {
    systemPrefix: 'Explain this as if to a 10-year-old with no background knowledge. Use simple words, relatable analogies, and avoid jargon.',
    maxTokensHint: 500,
    temperature: 0.6,
    label: 'Simple Explain',
    icon: '👶',
  },
  expert: {
    systemPrefix: 'The user is an expert. Skip basics. Use technical terminology freely. Go deep.',
    maxTokensHint: 1500,
    temperature: 0.4,
    label: 'Expert',
    icon: '🎓',
  },
  hebrew_only: {
    systemPrefix: 'תענה רק בעברית. אסור לכתוב באנגלית בכלל, אפילו אם השאלה באנגלית.',
    maxTokensHint: 1000,
    temperature: 0.7,
    label: 'עברית בלבד',
    icon: '🇮🇱',
  },
  bullet_only: {
    systemPrefix: 'Always respond in bullet points only. Maximum 7 bullets. Each bullet: one clear point.',
    maxTokensHint: 400,
    temperature: 0.4,
    label: 'Bullet Points',
    icon: '📋',
  },
};

let _currentMode: AIMode = 'standard';

export function setAIMode(mode: AIMode): void {
  _currentMode = mode;
}

export function getAIMode(): AIMode {
  return _currentMode;
}

export function getModeSystemPrefix(): string {
  return MODE_CONFIGS[_currentMode].systemPrefix;
}

// Inject mode prefix into a query
export function applyModeToQuery(query: string): string {
  const prefix = getModeSystemPrefix();
  if (!prefix) return query;
  return `[System: ${prefix}]\n\n${query}`;
}

// Auto-detect the best mode for a given query
export function autoDetectMode(query: string): AIMode {
  const lower = query.toLowerCase();

  if (/מה זה|explain|הסבר|what is|מהו|what are/i.test(lower) && query.length < 80) {
    return 'explain_simple';
  }
  if (/תסביר בפירוט|deep dive|analyze|נתח|research|explore all/i.test(lower)) {
    return 'deep_research';
  }
  if (/כתוב|write|compose|create a story|poem|song|קצר|שיר/i.test(lower)) {
    return 'creative';
  }
  if (/בקצרה|briefly|summary|tldr|סיכום קצר/i.test(lower)) {
    return 'focus';
  }
  if (/help me think|אני חושב|what should i|מה לעשות/i.test(lower) && query.length > 100) {
    return 'socratic';
  }

  return 'standard';
}

// ─── Session context memory ───────────────────────────────────────────────────
interface SessionContext {
  userName?: string;
  language: 'he' | 'en' | 'auto';
  recentTopics: string[];
  sessionStart: number;
}

let _session: SessionContext = {
  language: 'auto',
  recentTopics: [],
  sessionStart: Date.now(),
};

export function updateSessionContext(update: Partial<SessionContext>): void {
  _session = { ..._session, ...update };
}

export function addRecentTopic(topic: string): void {
  _session.recentTopics = [topic, ..._session.recentTopics].slice(0, 20);
}

export function getSessionContext(): SessionContext {
  return { ..._session };
}

export function getSessionDurationMin(): number {
  return Math.round((Date.now() - _session.sessionStart) / 60000);
}

// ─── Query preprocessing pipeline ────────────────────────────────────────────
export interface ProcessedQuery {
  original: string;
  augmented: string;
  mode: AIMode;
  detectedLanguage: 'he' | 'en' | 'mixed';
  isQuestion: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export function preprocessQuery(query: string): ProcessedQuery {
  const hebrewChars = (query.match(/[֐-׿]/g) ?? []).length;
  const totalChars = query.replace(/\s/g, '').length;
  const hebrewRatio = totalChars > 0 ? hebrewChars / totalChars : 0;

  const detectedLanguage: 'he' | 'en' | 'mixed' =
    hebrewRatio > 0.6 ? 'he' : hebrewRatio > 0.1 ? 'mixed' : 'en';

  const isQuestion = /\?|מה |איך |למה |מתי |איפה |who|what|when|where|why|how/.test(query);

  const words = query.trim().split(/\s+/).length;
  const estimatedComplexity: 'low' | 'medium' | 'high' =
    words < 15 ? 'low' : words < 50 ? 'medium' : 'high';

  const mode = _currentMode === 'standard' ? autoDetectMode(query) : _currentMode;
  const augmented = applyModeToQuery(query);

  return { original: query, augmented, mode, detectedLanguage, isQuestion, estimatedComplexity };
}
