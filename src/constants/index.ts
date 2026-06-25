export const COLORS = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceHigh: '#1e1e1e',
  border: '#2a2a2a',
  accent: '#6366f1',       // indigo
  accentGlow: '#4f46e5',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  text: '#f5f5f5',
  textMuted: '#6b7280',
  textDim: '#374151',
  claude: '#d97706',       // amber - Claude
  openai: '#10b981',       // emerald - OpenAI
  gemini: '#3b82f6',       // blue - Gemini
  grok: '#a855f7',         // purple - Grok
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

export const DEFAULT_WAKE_WORD = 'היי זון';
export const DEFAULT_STOP_WORD = 'עצור';

export const BACKGROUND_TASK_NAME = 'ZON_BACKGROUND_LISTENER';
export const BACKGROUND_FETCH_TASK = 'ZON_BACKGROUND_FETCH';

export const MAX_CONTEXT_MESSAGES = 20;
export const SILENCE_TIMEOUT_MS = 2500;   // 2.5s silence = end of query
export const SPEECH_SESSION_TIMEOUT_MS = 55000; // restart recognition before 60s iOS limit
