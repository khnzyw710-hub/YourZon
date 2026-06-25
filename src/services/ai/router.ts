import { AIProvider } from '@/constants';
import { Message, Settings } from '@/store';
import { streamClaude } from './claude';
import { streamOpenAI } from './openai';
import { streamGemini } from './gemini';
import { streamGrok } from './grok';
import { buildMemoryContext } from '@/services/memory';

// ─── Keyword-based routing (fast, no API call needed) ────────────────────────
function keywordRoute(query: string, settings: Settings): AIProvider | null {
  const q = query.toLowerCase();
  const { anthropic, openai, gemini, grok } = settings.apiKeys;

  if (
    /היום|עכשיו|חדשות|ספורט|מזג אוויר|today|news|weather|scores|latest|twitter/.test(q) &&
    grok
  )
    return 'grok';

  if (
    /קוד|תכנת|באג|debug|code|function|typescript|python|javascript|algorithm|analyze/.test(q) &&
    anthropic
  )
    return 'claude';

  if (/תראה|מה יש|look|see|image|vision|camera|what is this/.test(q) && openai)
    return 'openai';

  if (/סכם|תסכם|מסמך|ארוך|summarize|document|long|translate/.test(q) && gemini)
    return 'gemini';

  return null;
}

// ─── Default priority order ───────────────────────────────────────────────────
function defaultProvider(settings: Settings): AIProvider {
  const { anthropic, openai, gemini, grok } = settings.apiKeys;
  if (anthropic) return 'claude';
  if (openai) return 'openai';
  if (gemini) return 'gemini';
  if (grok) return 'grok';
  throw new Error('no_api_keys');
}

// ─── Get the streaming generator for a provider ──────────────────────────────
function getStream(
  provider: AIProvider,
  messages: Message[],
  query: string,
  settings: Settings,
  imageBase64: string | undefined,
  memory: string
): AsyncGenerator<string> {
  const { anthropic, openai, gemini, grok } = settings.apiKeys;
  switch (provider) {
    case 'claude':
      return streamClaude(messages, query, anthropic, imageBase64, memory);
    case 'openai':
      return streamOpenAI(messages, query, openai, imageBase64, memory);
    case 'gemini':
      return streamGemini(messages, query, gemini, imageBase64, memory);
    case 'grok':
      return streamGrok(messages, query, grok, memory);
  }
}

// ─── Race mode: first response wins ──────────────────────────────────────────
async function raceProviders(
  providers: AIProvider[],
  messages: Message[],
  query: string,
  settings: Settings,
  imageBase64: string | undefined,
  memory: string
): Promise<{ stream: AsyncGenerator<string>; provider: AIProvider }> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let pending = providers.length;

    for (const provider of providers) {
      // Start the stream and try to get the first chunk
      (async () => {
        try {
          const gen = getStream(provider, messages, query, settings, imageBase64, memory);
          const first = await gen.next();
          if (!resolved && !first.done) {
            resolved = true;
            // Reconstruct generator with the first chunk prepended
            async function* prependedGen() {
              yield first.value;
              yield* gen;
            }
            resolve({ stream: prependedGen(), provider });
          }
        } catch {
          pending--;
          if (pending === 0 && !resolved) reject(new Error('all_providers_failed'));
        }
      })();
    }
  });
}

// ─── Main router ──────────────────────────────────────────────────────────────
export async function routeToAIStream(
  query: string,
  messages: Message[],
  settings: Settings,
  imageBase64?: string
): Promise<{ stream: AsyncGenerator<string>; provider: AIProvider }> {
  const memory = await buildMemoryContext(query);

  if (settings.preferredProvider !== 'auto') {
    const provider = settings.preferredProvider as AIProvider;
    return {
      stream: getStream(provider, messages, query, settings, imageBase64, memory),
      provider,
    };
  }

  if (!settings.smartRoute) {
    const provider = defaultProvider(settings);
    return {
      stream: getStream(provider, messages, query, settings, imageBase64, memory),
      provider,
    };
  }

  // Smart route: try keyword match first (instant)
  const keywordPick = keywordRoute(query, settings);
  if (keywordPick) {
    return {
      stream: getStream(keywordPick, messages, query, settings, imageBase64, memory),
      provider: keywordPick,
    };
  }

  // Race mode: send to all available providers, first wins
  const available: AIProvider[] = [];
  const { anthropic, openai, gemini, grok } = settings.apiKeys;
  if (anthropic) available.push('claude');
  if (openai) available.push('openai');
  if (gemini) available.push('gemini');
  if (grok) available.push('grok');

  if (available.length === 0) throw new Error('no_api_keys');

  if (available.length === 1) {
    return {
      stream: getStream(available[0], messages, query, settings, imageBase64, memory),
      provider: available[0],
    };
  }

  return raceProviders(available, messages, query, settings, imageBase64, memory);
}

// ─── Non-streaming wrapper (for agent tools, fact extraction, etc.) ───────────
export async function routeToAI(
  query: string,
  messages: Message[],
  settings: Settings,
  imageBase64?: string
): Promise<{ response: string; provider: AIProvider }> {
  const { stream, provider } = await routeToAIStream(query, messages, settings, imageBase64);
  let response = '';
  for await (const chunk of stream) {
    response += chunk;
  }
  return { response, provider };
}
