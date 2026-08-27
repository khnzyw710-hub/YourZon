// Emotion / Tone Adapter — analyzes transcript sentiment and adapts AI persona
// prompt dynamically. Detects: stressed, happy, tired, frustrated, excited, neutral.

export type EmotionState =
  | 'neutral'
  | 'stressed'
  | 'happy'
  | 'tired'
  | 'frustrated'
  | 'excited'
  | 'focused';

export interface EmotionAnalysis {
  state: EmotionState;
  confidence: number;
  signals: string[];
}

// ─── Keyword signal sets ──────────────────────────────────────────────────────
const EMOTION_SIGNALS: Record<EmotionState, { patterns: RegExp[]; weight: number }> = {
  stressed: {
    weight: 1.0,
    patterns: [
      /(?:לחוץ|לחוצה|לחץ|עמוס|עמוסה|עמוסים)/i,
      /(?:אין לי זמן|אין זמן|מת מלחץ|מתה מלחץ)/i,
      /(?:deadline|urgent|asap|emergency|overwhelmed|stressed|stress|anxiety)/i,
      /(?:!{2,}|\?{2,})/,
      /(?:לא יודע מה לעשות|מבולבל|מבולבלת)/i,
    ],
  },
  frustrated: {
    weight: 1.0,
    patterns: [
      /(?:כועס|כועסת|מתעצבן|מתעצבנת|זה מעצבן|מעצבן)/i,
      /(?:לא עובד|לא מצליח|כבר שעות|שוב לא|עוד פעם)/i,
      /(?:frustrated|annoyed|angry|furious|can't|cannot|doesn't work)/i,
      /(?:אחרי\s+כל\s+כך\s+הרבה|תמיד\s+ה|שוב\s+ה)/i,
    ],
  },
  happy: {
    weight: 0.9,
    patterns: [
      /(?:מעולה|נהדר|מדהים|אחלה|סבבה|מושלם|יופי|ברוך)/i,
      /(?:שמח|שמחה|מרוצה|מצוין|הצלחה|הצלחתי)/i,
      /(?:great|awesome|perfect|excellent|love it|happy|wonderful|amazing)/i,
      /(?:😊|😄|🎉|❤️|👍|✨)/,
    ],
  },
  excited: {
    weight: 0.9,
    patterns: [
      /(?:וואו|יאללה|סוף סוף|לא מאמין|לא מאמינה|מטורף|מטורפת)/i,
      /(?:wow|omg|incredible|unbelievable|finally|yes!|let's go)/i,
      /(?:!{3,})/,
      /(?:הפתעה|הצלחה|עלייתי|תירוץ)/i,
    ],
  },
  tired: {
    weight: 0.8,
    patterns: [
      /(?:עייף|עייפה|לא ישנתי|כמעט לא ישנתי|מותש|מותשת)/i,
      /(?:tired|exhausted|sleepy|barely slept|can't focus|brain fog)/i,
      /(?:בוקר|לילה|מאוחר|כל הלילה)/i,
    ],
  },
  focused: {
    weight: 0.7,
    patterns: [
      /(?:רוצה לעבוד|צריך להתרכז|מתרכז|מתרכזת|deep work)/i,
      /(?:בלי הפרעות|שקט|להתמקד|focus|concentrate|working on)/i,
      /(?:פוקוס|קפה|מוזיקה ברקע|אוזניות)/i,
    ],
  },
  neutral: { weight: 0.1, patterns: [] },
};

// ─── Sliding window history ───────────────────────────────────────────────────
interface EmotionSample {
  state: EmotionState;
  confidence: number;
  ts: number;
}

const HISTORY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
let _history: EmotionSample[] = [];
let _currentEmotion: EmotionState = 'neutral';

// ─── Analysis ─────────────────────────────────────────────────────────────────
export function analyzeEmotion(text: string): EmotionAnalysis {
  const scores: Record<EmotionState, number> = {
    neutral: 0.1,
    stressed: 0, frustrated: 0, happy: 0,
    excited: 0, tired: 0, focused: 0,
  };
  const signals: string[] = [];

  for (const [state, { patterns, weight }] of Object.entries(EMOTION_SIGNALS) as Array<[EmotionState, { patterns: RegExp[]; weight: number }]>) {
    if (state === 'neutral') continue;
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m) {
        scores[state] += weight;
        signals.push(`${state}: "${m[0]}"`);
        break;
      }
    }
  }

  // Word count and punctuation signals
  const wordCount = text.split(/\s+/).length;
  const exclamations = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const caps = (text.match(/[A-Z]{2,}/g) ?? []).length;

  if (exclamations > 2 || caps > 1) scores.excited += 0.3;
  if (questions > 2) scores.stressed += 0.2;
  if (wordCount < 5 && text.length < 25) scores.tired += 0.2;

  // Find winner
  let maxScore = 0;
  let winner: EmotionState = 'neutral';
  for (const [state, score] of Object.entries(scores) as Array<[EmotionState, number]>) {
    if (score > maxScore) { maxScore = score; winner = state; }
  }

  const confidence = Math.min(1, maxScore / 2);
  const result: EmotionAnalysis = { state: winner, confidence, signals };

  // Update history
  const now = Date.now();
  _history = _history.filter((s) => now - s.ts < HISTORY_WINDOW_MS);
  _history.push({ state: winner, confidence, ts: now });

  // Smooth: use weighted most-frequent in window
  const counts: Record<string, number> = {};
  for (const s of _history) {
    counts[s.state] = (counts[s.state] ?? 0) + s.confidence;
  }
  let smoothWinner: EmotionState = 'neutral';
  let smoothMax = 0;
  for (const [s, c] of Object.entries(counts)) {
    if (c > smoothMax) { smoothMax = c; smoothWinner = s as EmotionState; }
  }
  _currentEmotion = smoothWinner;

  return result;
}

export function getCurrentEmotion(): EmotionState {
  return _currentEmotion;
}

// ─── System prompt addon per emotion ─────────────────────────────────────────
const EMOTION_PROMPTS: Record<EmotionState, string> = {
  neutral: '',
  stressed: 'The user seems stressed or time-pressured. Be concise, prioritize actionable answers, skip lengthy explanations.',
  frustrated: 'The user seems frustrated. Acknowledge their frustration briefly, then provide clear direct help. Avoid lengthy preambles.',
  happy: 'The user is in a good mood. Match their energy with a positive, engaged tone.',
  excited: 'The user is excited. Be enthusiastic and match their energy. Keep it energetic and to the point.',
  tired: 'The user seems tired or low-energy. Keep responses short, gentle, and easy to follow. Avoid complex explanations.',
  focused: 'The user is in focus/work mode. Be precise and minimal. No small talk. Just the information they need.',
};

export function getEmotionSystemPrompt(state?: EmotionState): string {
  return EMOTION_PROMPTS[state ?? _currentEmotion] ?? '';
}

export function getEmotionIcon(state: EmotionState): string {
  const icons: Record<EmotionState, string> = {
    neutral: 'ellipse-outline',
    stressed: 'flash-outline',
    frustrated: 'thunderstorm-outline',
    happy: 'sunny-outline',
    excited: 'star-outline',
    tired: 'moon-outline',
    focused: 'radio-button-on-outline',
  };
  return icons[state];
}

export function getEmotionLabel(state: EmotionState): string {
  const labels: Record<EmotionState, string> = {
    neutral: 'רגיל',
    stressed: 'לחוץ',
    frustrated: 'מתוסכל',
    happy: 'שמח',
    excited: 'נרגש',
    tired: 'עייף',
    focused: 'ממוקד',
  };
  return labels[state];
}

export function resetEmotionHistory(): void {
  _history = [];
  _currentEmotion = 'neutral';
}
