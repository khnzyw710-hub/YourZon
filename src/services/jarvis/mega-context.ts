// Mega Context Builder — aggregates every data source into one rich AI context.
// This is what separates JARVIS from a regular chatbot.

import { buildMemoryContext } from '@/services/memory';
import { getChronicleStats, getBehavioralPrediction } from '@/services/chronicle';
import { getPendingCommitments } from '@/services/commitments';
import { getTopEntities } from '@/services/knowledge/graph';
import { getCurrentEmotion, getEmotionLabel } from '@/services/emotion';
import { getFocusState } from '@/services/focus';
import { getSpatialContext } from '@/services/biometric';
import { getTodayStats } from '@/services/lifetracker';
import { getPassiveDayStats } from '@/services/passive';
import { getTodayEvents, formatEventForSpeech } from '@/services/integrations/calendar';
import { buildProfileSystemPrompt, loadUserProfile } from '@/services/user/profile';
import { format } from 'date-fns';
import type { Settings } from '@/store';

export interface MegaContext {
  systemPrompt: string;
  contextInjection: string;
  estimatedTokens: number;
}

// ─── Build full system prompt ─────────────────────────────────────────────────
export async function buildMegaContext(
  query: string,
  settings: Settings
): Promise<MegaContext> {
  const now = new Date();
  const dayOfWeek = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][now.getDay()];

  // Run all context fetches in parallel
  const [
    userProfile,
    memoryCtx,
    todayStats,
    commitments,
    entities,
    calendar,
    behavioralPrediction,
    spatialCtx,
    passiveStats,
    chronicleStats,
  ] = await Promise.all([
    loadUserProfile().catch(() => null),
    buildMemoryContext(query).catch(() => ''),
    settings.lifeTracking ? getTodayStats().catch(() => null) : Promise.resolve(null),
    getPendingCommitments().catch(() => []),
    settings.knowledgeGraph ? getTopEntities(8).catch(() => []) : Promise.resolve([]),
    getTodayEvents().catch(() => []),
    getBehavioralPrediction().catch(() => null),
    settings.spatialContext ? getSpatialContext().catch(() => null) : Promise.resolve(null),
    settings.passiveMode ? getPassiveDayStats().catch(() => null) : Promise.resolve(null),
    settings.chronicleEnabled ? getChronicleStats().catch(() => null) : Promise.resolve(null),
  ]);

  const emotion = getCurrentEmotion();
  const focusState = getFocusState();

  // ── System prompt assembly ────────────────────────────────────────────────
  const systemParts: string[] = [];

  // Identity
  systemParts.push(
    `אתה ZON — עוזר AI אישי שעובד על אוזניה. אתה ג'ארביס האמיתי: ` +
    `אתה יודע הכל על המשתמש שלך, מכיר את חייו, זוכר כל שיחה, ` +
    `ופועל כמו עוזר אישי ברמה הגבוהה ביותר שיש.`
  );

  // User profile
  if (userProfile) {
    const profilePrompt = buildProfileSystemPrompt(userProfile);
    if (profilePrompt) systemParts.push(profilePrompt);
  }

  // Temporal awareness
  systemParts.push(
    `היום: ${format(now, 'EEEE dd/MM/yyyy')}, ${dayOfWeek}, שעה ${format(now, 'HH:mm')}.`
  );

  // Focus state
  if (focusState.phase === 'focusing') {
    systemParts.push(`המשתמש כרגע במצב פוקוס (${Math.floor(focusState.remainingSec / 60)} דקות נותרו). הוא מרוכז בעבודה.`);
  }

  // Emotion awareness
  if (emotion !== 'neutral') {
    systemParts.push(`המשתמש נראה ${getEmotionLabel(emotion)} כרגע. התחשב בכך בטון שלך.`);
  }

  // ── Context injection ─────────────────────────────────────────────────────
  const contextParts: string[] = [];

  // Location
  if (spatialCtx?.currentCluster) {
    contextParts.push(`📍 מיקום: ${spatialCtx.currentCluster}`);
  }

  // Life stats
  if (todayStats && todayStats.steps > 0) {
    const parts = [`${todayStats.steps.toLocaleString()} צעדים`, `${todayStats.calories} קל'`];
    if (todayStats.distanceM > 100) parts.push(`${(todayStats.distanceM / 1000).toFixed(1)} ק"מ`);
    if (todayStats.places.length > 0) parts.push(`היה ב: ${todayStats.places.map((p) => p.name).join(', ')}`);
    contextParts.push(`🏃 היום: ${parts.join(' · ')}`);
  }

  // Calendar
  if (calendar.length > 0) {
    contextParts.push(`📅 אירועים היום: ${calendar.slice(0, 3).map(formatEventForSpeech).join('; ')}`);
  }

  // Behavioral prediction
  if (behavioralPrediction) {
    contextParts.push(`🔮 ${behavioralPrediction}`);
  }

  // Overdue commitments
  const overdue = commitments.filter((c) => c.dueTs && c.dueTs < Date.now());
  if (overdue.length > 0) {
    contextParts.push(`⚠️ התחייבויות באיחור: ${overdue.map((c) => c.text).join('; ')}`);
  } else if (commitments.length > 0) {
    contextParts.push(`📌 ממתין: ${commitments.slice(0, 3).map((c) => c.text).join('; ')}`);
  }

  // Top known entities
  if (entities.length > 0) {
    const people = entities.filter((e) => e.type === 'person').slice(0, 4);
    if (people.length > 0) {
      contextParts.push(`👥 אנשים מוכרים: ${people.map((e) => e.name).join(', ')}`);
    }
  }

  // Passive day stats (conversations heard)
  if (passiveStats && passiveStats.totalSegments > 0) {
    contextParts.push(`🎙️ שמע היום: ${passiveStats.totalSegments} שיחות, ${passiveStats.uniquePeople.length} אנשים`);
  }

  // Chronicle streak
  if (chronicleStats && chronicleStats.streak > 0) {
    contextParts.push(`🔥 רצף שיחות: ${chronicleStats.streak} ימים`);
  }

  // Memory context
  if (memoryCtx) {
    contextParts.push(`🧠 זיכרון רלוונטי:\n${memoryCtx}`);
  }

  const contextInjection = contextParts.join('\n');
  const estimatedTokens = Math.ceil((systemParts.join(' ').length + contextInjection.length) / 4);

  return {
    systemPrompt: systemParts.join('\n\n'),
    contextInjection,
    estimatedTokens,
  };
}

// ─── Quick context (no heavy DB calls, just in-memory state) ─────────────────
export function buildQuickContext(settings: Settings): string {
  const now = new Date();
  const emotion = getCurrentEmotion();
  const focus = getFocusState();

  const parts: string[] = [`שעה: ${format(now, 'HH:mm')}`];
  if (emotion !== 'neutral') parts.push(`מצב: ${getEmotionLabel(emotion)}`);
  if (focus.phase === 'focusing') parts.push(`פוקוס: ${Math.floor(focus.remainingSec / 60)}דק'`);

  return `[${parts.join(' · ')}]`;
}
