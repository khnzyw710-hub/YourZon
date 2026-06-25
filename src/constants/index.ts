export const COLORS = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceHigh: '#1e1e1e',
  border: '#2a2a2a',
  accent: '#6366f1',
  accentGlow: '#4f46e5',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#f5f5f5',
  textMuted: '#6b7280',
  textDim: '#374151',
  claude: '#d97706',
  openai: '#10b981',
  gemini: '#3b82f6',
  grok: '#a855f7',
} as const;

export const AI_PROVIDERS = {
  claude: {
    name: 'Claude',
    color: COLORS.claude,
    model: 'claude-sonnet-4-6',
    strengths: ['reasoning', 'analysis', 'coding', 'writing'],
  },
  openai: {
    name: 'GPT-4o',
    color: COLORS.openai,
    model: 'gpt-4o',
    strengths: ['vision', 'general', 'math', 'browsing'],
  },
  gemini: {
    name: 'Gemini',
    color: COLORS.gemini,
    model: 'gemini-2.0-flash',
    strengths: ['speed', 'longContext', 'multimodal', 'search'],
  },
  grok: {
    name: 'Grok',
    color: COLORS.grok,
    model: 'grok-3',
    strengths: ['realtime', 'humor', 'xPlatform', 'current'],
  },
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;

export const PERSONA_LABELS = {
  auto: 'אוטומטי',
  business: 'עסקי',
  quick: 'מהיר',
  creative: 'יצירתי',
  learning: 'למידה',
} as const;

export const PERSONA_SYSTEM_ADDONS: Record<string, string> = {
  business: 'Be formal, structured, and data-driven. Focus on actionable insights.',
  quick: 'Be extremely brief. Answer in 1-2 sentences max.',
  creative: 'Be imaginative, lateral, and exploratory. Think outside the box.',
  learning: 'Be pedagogical. Explain with examples and analogies. Check understanding.',
};

export const DEFAULT_WAKE_WORD = 'היי זון';
export const DEFAULT_STOP_WORD = 'עצור';

export const BACKGROUND_TASK_NAME = 'ZON_BACKGROUND_LISTENER';
export const BACKGROUND_FETCH_TASK = 'ZON_BACKGROUND_FETCH';

export const MAX_CONTEXT_MESSAGES = 20;
export const SILENCE_TIMEOUT_MS = 2500;
export const SPEECH_SESSION_TIMEOUT_MS = 55000;
