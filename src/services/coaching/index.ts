// Real-time conversation coaching — tracks speaking ratio, detects emotional signals,
// whispers context-aware tips during live conversations.

export interface CoachingTip {
  text: string;
  urgency: 'low' | 'medium' | 'high';
  triggerReason: string;
}

export interface CoachingStats {
  userWordCount: number;
  totalWordCount: number;
  speakingRatio: number;
  sessionDuration: number;
  tipsGiven: number;
}

// ─── State ────────────────────────────────────────────────────────────────────
let _active = false;
let _sessionStart = 0;
let _userWords = 0;
let _totalWords = 0;
let _lastTipTime = 0;
let _lastSpeaker: 'user' | 'other' = 'user';
let _tipsGiven = 0;
let _onTip: ((tip: CoachingTip) => void) | null = null;

// Buffer of recent speech for pattern detection
let _recentTranscripts: Array<{ text: string; speaker: 'user' | 'other'; time: number }> = [];

const MIN_TIP_INTERVAL_MS = 30000; // max one tip per 30 seconds

// ─── Coaching rules ───────────────────────────────────────────────────────────
interface CoachingRule {
  name: string;
  check: () => CoachingTip | null;
}

const PRICE_PATTERN = /מחיר|עלות|תקציב|price|cost|budget|expensive|cheap/gi;
const FRUSTRATION_PATTERN = /מתוסכל|כועס|מאוד|frustrated|angry|upset|problem|issue|doesn't work/gi;
const AGREEMENT_PATTERN = /בסדר|כן|אוקיי|yes|okay|sure|agreed|absolutely|exactly/gi;
const QUESTION_PATTERN = /\?|מה|למה|איך|why|what|how|when|where|can you/gi;

const RULES: CoachingRule[] = [
  {
    name: 'speaking_ratio',
    check: () => {
      if (_totalWords < 50) return null; // need enough data
      const ratio = _userWords / Math.max(1, _totalWords);
      if (ratio > 0.75) {
        return {
          text: 'אתה מדבר הרבה — שאל שאלה פתוחה',
          urgency: 'medium',
          triggerReason: `Speaking ${Math.round(ratio * 100)}% of time`,
        };
      }
      if (ratio < 0.2) {
        return {
          text: 'הזדמנות לדבר — שתף נקודת מבט',
          urgency: 'low',
          triggerReason: 'Very low speaking ratio',
        };
      }
      return null;
    },
  },
  {
    name: 'price_mentioned',
    check: () => {
      const recent = _recentTranscripts.slice(-10).map((t) => t.text).join(' ');
      const priceCount = (recent.match(PRICE_PATTERN) ?? []).length;
      if (priceCount >= 2) {
        return {
          text: 'מוזכר מחיר — הדגש ערך ו-ROI',
          urgency: 'medium',
          triggerReason: `Price mentioned ${priceCount} times recently`,
        };
      }
      return null;
    },
  },
  {
    name: 'frustration_detected',
    check: () => {
      const recent = _recentTranscripts.slice(-5).map((t) => t.text).join(' ');
      if (FRUSTRATION_PATTERN.test(recent)) {
        FRUSTRATION_PATTERN.lastIndex = 0;
        return {
          text: 'זיהיתי תסכול — הכר בדאגה לפני פתרון',
          urgency: 'high',
          triggerReason: 'Frustration keywords detected',
        };
      }
      return null;
    },
  },
  {
    name: 'no_questions_asked',
    check: () => {
      if (_totalWords < 100) return null;
      const userTexts = _recentTranscripts
        .filter((t) => t.speaker === 'user')
        .slice(-10)
        .map((t) => t.text)
        .join(' ');
      const questionCount = (userTexts.match(QUESTION_PATTERN) ?? []).length;
      if (questionCount === 0 && _totalWords > 150) {
        return {
          text: 'לא שאלת שאלות — גלה עניין אמיתי',
          urgency: 'low',
          triggerReason: 'No questions in last 150 words',
        };
      }
      return null;
    },
  },
  {
    name: 'positive_signal',
    check: () => {
      const recent = _recentTranscripts.slice(-3).map((t) => t.text).join(' ');
      const agreementCount = (recent.match(AGREEMENT_PATTERN) ?? []).length;
      if (agreementCount >= 2) {
        return {
          text: 'סיגנל חיובי — הרחב על ה-"כן"',
          urgency: 'low',
          triggerReason: 'Multiple agreement signals',
        };
      }
      return null;
    },
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────
export function startCoachingSession(onTip: (tip: CoachingTip) => void): void {
  _active = true;
  _sessionStart = Date.now();
  _userWords = 0;
  _totalWords = 0;
  _lastTipTime = 0;
  _tipsGiven = 0;
  _recentTranscripts = [];
  _onTip = onTip;
}

export function stopCoachingSession(): void {
  _active = false;
  _onTip = null;
}

export function isCoachingActive(): boolean {
  return _active;
}

// Called with every recognized transcript during coaching mode
export function processCoachingTranscript(
  text: string,
  isUserSpeaking: boolean
): void {
  if (!_active || !text.trim()) return;

  const wordCount = text.trim().split(/\s+/).length;
  const speaker: 'user' | 'other' = isUserSpeaking ? 'user' : 'other';

  if (isUserSpeaking) _userWords += wordCount;
  _totalWords += wordCount;
  _lastSpeaker = speaker;

  _recentTranscripts.push({ text, speaker, time: Date.now() });
  if (_recentTranscripts.length > 50) _recentTranscripts.shift();

  // Check rules (throttled)
  const now = Date.now();
  if (now - _lastTipTime < MIN_TIP_INTERVAL_MS) return;

  for (const rule of RULES) {
    const tip = rule.check();
    if (tip) {
      _lastTipTime = now;
      _tipsGiven++;
      _onTip?.(tip);
      break; // one tip at a time
    }
  }
}

export function getCoachingStats(): CoachingStats {
  return {
    userWordCount: _userWords,
    totalWordCount: _totalWords,
    speakingRatio: _totalWords > 0 ? _userWords / _totalWords : 0,
    sessionDuration: _active ? Date.now() - _sessionStart : 0,
    tipsGiven: _tipsGiven,
  };
}

export function resetCoachingStats(): void {
  _userWords = 0;
  _totalWords = 0;
  _tipsGiven = 0;
  _recentTranscripts = [];
  _lastTipTime = 0;
}
