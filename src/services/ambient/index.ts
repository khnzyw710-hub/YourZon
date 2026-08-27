// Ambient Intelligence — continuously monitors audio patterns to build a "world model"
// of what the user is doing without explicit interaction.

export type AmbientContext =
  | 'idle'       // quiet, user probably free
  | 'focused'    // low noise, working
  | 'meeting'    // multiple voices, structured
  | 'call'       // one voice, pauses
  | 'watching'   // consistent background audio (TV/video)
  | 'commuting'  // traffic/transport sounds
  | 'sleeping';  // long silence at night

export interface AmbientEvent {
  type: 'context_change' | 'proactive_alert';
  context?: AmbientContext;
  message?: string;
  timestamp: number;
}

// ─── State ────────────────────────────────────────────────────────────────────
let _currentContext: AmbientContext = 'idle';
let _contextSince = Date.now();
let _onEvent: ((event: AmbientEvent) => void) | null = null;
let _running = false;

// Energy tracking over 30-second windows
let _energyWindow: number[] = [];
let _speakerChanges = 0;
let _silenceDuration = 0;
let _lastVoiceTime = Date.now();
let _windowTimer: ReturnType<typeof setInterval> | null = null;

// Ambient log for proactive insights
interface AmbientLogEntry {
  context: AmbientContext;
  startTime: number;
  endTime: number;
  duration: number;
}

let _ambientLog: AmbientLogEntry[] = [];
const MAX_LOG_SIZE = 100;

// ─── Context detection logic ──────────────────────────────────────────────────
function detectContext(
  avgEnergy: number,
  speakerChangesPerMin: number,
  silenceFraction: number
): AmbientContext {
  const hour = new Date().getHours();

  if (silenceFraction > 0.95 && (hour >= 23 || hour < 6)) return 'sleeping';
  if (silenceFraction > 0.85) return 'idle';

  if (speakerChangesPerMin > 4 && avgEnergy > -45) return 'meeting';
  if (speakerChangesPerMin > 1 && avgEnergy > -50) return 'call';
  if (avgEnergy > -35 && speakerChangesPerMin < 1) return 'watching';
  if (avgEnergy > -55 && silenceFraction < 0.4) return 'commuting';
  if (silenceFraction > 0.6 && avgEnergy < -55) return 'focused';

  return 'idle';
}

// ─── Update context and fire events ─────────────────────────────────────────
function updateContext(newCtx: AmbientContext): void {
  if (newCtx === _currentContext) return;

  // Log the previous context
  const now = Date.now();
  const entry: AmbientLogEntry = {
    context: _currentContext,
    startTime: _contextSince,
    endTime: now,
    duration: now - _contextSince,
  };
  _ambientLog.push(entry);
  if (_ambientLog.length > MAX_LOG_SIZE) _ambientLog.shift();

  const prev = _currentContext;
  _currentContext = newCtx;
  _contextSince = now;

  _onEvent?.({ type: 'context_change', context: newCtx, timestamp: now });

  // Proactive alerts based on transitions
  checkProactiveAlerts(prev, newCtx, entry.duration);
}

function checkProactiveAlerts(
  from: AmbientContext,
  to: AmbientContext,
  durationMs: number
): void {
  const durationMin = durationMs / 60000;

  // Long meeting detected → suggest break
  if (from === 'meeting' && durationMin > 45) {
    _onEvent?.({
      type: 'proactive_alert',
      message: `היית בפגישה ${Math.round(durationMin)} דקות — איך אפשר לעזור עם הסיכום?`,
      timestamp: Date.now(),
    });
  }

  // Long focused work → remind to take a break
  if (from === 'focused' && to === 'idle' && durationMin > 90) {
    _onEvent?.({
      type: 'proactive_alert',
      message: `עבדת ממוקד ${Math.round(durationMin)} דקות — שקול הפסקה קצרה`,
      timestamp: Date.now(),
    });
  }

  // Waking up (from sleeping)
  if (from === 'sleeping' && to !== 'sleeping') {
    _onEvent?.({
      type: 'proactive_alert',
      message: 'בוקר טוב! רוצה שאסכם את לוח היום שלך?',
      timestamp: Date.now(),
    });
  }
}

// ─── Feed audio data into the ambient engine ──────────────────────────────────
export function feedAmbientAudio(dbLevel: number, hasSpeech: boolean): void {
  if (!_running) return;

  _energyWindow.push(dbLevel);
  if (_energyWindow.length > 300) _energyWindow.shift(); // ~30s at 100ms intervals

  const now = Date.now();
  if (hasSpeech) {
    if (now - _lastVoiceTime > 3000) _speakerChanges++; // gap > 3s = new speaker turn
    _lastVoiceTime = now;
    _silenceDuration = 0;
  } else {
    _silenceDuration += 100;
  }
}

// ─── Periodic context evaluation (every 10s) ─────────────────────────────────
function evaluateContext(): void {
  if (_energyWindow.length < 10) return;

  const avgEnergy = _energyWindow.reduce((a, b) => a + b, 0) / _energyWindow.length;
  const silentSamples = _energyWindow.filter((e) => e < -55).length;
  const silenceFraction = silentSamples / _energyWindow.length;
  const speakerChangesPerMin = (_speakerChanges / (_energyWindow.length * 0.1)) * 60;

  const newCtx = detectContext(avgEnergy, speakerChangesPerMin, silenceFraction);
  updateContext(newCtx);

  // Reset speaker change counter periodically
  _speakerChanges = 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function startAmbientMonitor(onEvent: (event: AmbientEvent) => void): void {
  if (_running) return;
  _running = true;
  _onEvent = onEvent;
  _contextSince = Date.now();

  _windowTimer = setInterval(evaluateContext, 10000);
}

export function stopAmbientMonitor(): void {
  _running = false;
  _onEvent = null;
  if (_windowTimer) {
    clearInterval(_windowTimer);
    _windowTimer = null;
  }
  _energyWindow = [];
  _speakerChanges = 0;
}

export function getAmbientContext(): AmbientContext {
  return _currentContext;
}

export function getContextDuration(): number {
  return Date.now() - _contextSince;
}

export function getAmbientLog(): AmbientLogEntry[] {
  return [..._ambientLog];
}

// Human-readable context label
export function getContextLabel(ctx: AmbientContext): string {
  const labels: Record<AmbientContext, string> = {
    idle: 'פנוי',
    focused: 'עבודה ממוקדת',
    meeting: 'פגישה',
    call: 'שיחת טלפון',
    watching: 'צפייה',
    commuting: 'נסיעה',
    sleeping: 'ישן',
  };
  return labels[ctx];
}

// Context icon for UI
export function getContextIcon(ctx: AmbientContext): string {
  const icons: Record<AmbientContext, string> = {
    idle: 'ellipse-outline',
    focused: 'laptop-outline',
    meeting: 'people-outline',
    call: 'call-outline',
    watching: 'tv-outline',
    commuting: 'car-outline',
    sleeping: 'moon-outline',
  };
  return icons[ctx];
}
