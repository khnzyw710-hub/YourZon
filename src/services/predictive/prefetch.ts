// Predictive pre-fetch — starts loading context the moment VAD detects voice,
// so by the time the user finishes speaking, the context is already ready.

import { buildMemoryContext } from '@/services/memory';
import { getTodayEvents, formatEventForSpeech } from '@/services/integrations/calendar';
import { getCurrentLocation } from '@/services/integrations/location';
import { AIProvider } from '@/constants';

// ─── Prefetch cache ───────────────────────────────────────────────────────────
interface PrefetchCache {
  memoryContext: string;
  calendarContext: string;
  locationContext: string;
  suggestedProvider: AIProvider | null;
  prefetchedAt: number;
  earlyKeywords: string[];
}

let _cache: PrefetchCache | null = null;
let _prefetchPromise: Promise<void> | null = null;
const CACHE_TTL_MS = 30000; // cache valid for 30s after voice detection

// ─── Early keyword → provider hints ──────────────────────────────────────────
const PROVIDER_HINTS: Array<{ keywords: RegExp; provider: AIProvider }> = [
  { keywords: /היום|עכשיו|חדשות|latest|news|twitter|today|current/i, provider: 'grok' },
  { keywords: /קוד|תכנות|bug|code|function|algorithm|debug|typescript/i, provider: 'claude' },
  { keywords: /תראה|מה יש|look|see|camera|image|picture|photo/i, provider: 'openai' },
  { keywords: /תסכם|מסמך|long|summarize|translate|document/i, provider: 'gemini' },
];

function detectProviderFromKeywords(text: string): AIProvider | null {
  for (const hint of PROVIDER_HINTS) {
    if (hint.keywords.test(text)) return hint.provider;
  }
  return null;
}

// ─── Calendar context formatter ───────────────────────────────────────────────
async function buildCalendarContext(): Promise<string> {
  try {
    const events = await getTodayEvents();
    if (events.length === 0) return '';
    return `Today's events: ${events.slice(0, 3).map(formatEventForSpeech).join('; ')}`;
  } catch {
    return '';
  }
}

// ─── Location context ─────────────────────────────────────────────────────────
async function buildLocationContext(): Promise<string> {
  try {
    const loc = await getCurrentLocation();
    if (!loc) return '';
    return `Location: ${loc.city}`;
  } catch {
    return '';
  }
}

// ─── Trigger prefetch on voice detection ─────────────────────────────────────
export function onVoiceStart(initialHint = ''): void {
  // Don't re-fetch if cache is fresh
  const now = Date.now();
  if (_cache && now - _cache.prefetchedAt < CACHE_TTL_MS) {
    // Just update early keywords if we have a hint
    if (initialHint && _cache) {
      const provider = detectProviderFromKeywords(initialHint);
      if (provider) _cache.suggestedProvider = provider;
    }
    return;
  }

  // Start parallel prefetch immediately
  _prefetchPromise = (async () => {
    const [memoryContext, calendarContext, locationContext] = await Promise.all([
      buildMemoryContext(initialHint || 'general').catch(() => ''),
      buildCalendarContext(),
      buildLocationContext(),
    ]);

    _cache = {
      memoryContext,
      calendarContext,
      locationContext,
      suggestedProvider: detectProviderFromKeywords(initialHint),
      prefetchedAt: Date.now(),
      earlyKeywords: initialHint.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    };
  })().catch(() => {});
}

// ─── Update cache as more words arrive ───────────────────────────────────────
export function onEarlyWords(partialTranscript: string): void {
  const provider = detectProviderFromKeywords(partialTranscript);
  if (_cache && provider) {
    _cache.suggestedProvider = provider;
  }

  // If prefetch hasn't started or cache is stale, trigger it now
  if (!_cache || Date.now() - _cache.prefetchedAt > CACHE_TTL_MS) {
    onVoiceStart(partialTranscript);
  }
}

// ─── Get prefetched context (waits for prefetch to finish if in progress) ────
export async function getPrefetchedContext(): Promise<{
  memoryContext: string;
  calendarContext: string;
  locationContext: string;
  suggestedProvider: AIProvider | null;
}> {
  // Wait for any in-flight prefetch
  if (_prefetchPromise) {
    try { await _prefetchPromise; } catch {}
    _prefetchPromise = null;
  }

  if (_cache) {
    return {
      memoryContext: _cache.memoryContext,
      calendarContext: _cache.calendarContext,
      locationContext: _cache.locationContext,
      suggestedProvider: _cache.suggestedProvider,
    };
  }

  return { memoryContext: '', calendarContext: '', locationContext: '', suggestedProvider: null };
}

// ─── Refresh memory context for a specific query (fast semantic search) ───────
export async function refreshMemoryForQuery(query: string): Promise<string> {
  try {
    const memory = await buildMemoryContext(query);
    if (_cache) _cache.memoryContext = memory;
    return memory;
  } catch {
    return _cache?.memoryContext ?? '';
  }
}

export function clearPrefetchCache(): void {
  _cache = null;
  _prefetchPromise = null;
}
