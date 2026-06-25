import { AIProvider } from '@/constants';
import { Message, Settings } from '@/store';
import { askClaude } from './claude';
import { askOpenAI } from './openai';
import { askGemini } from './gemini';
import { askGrok } from './grok';

// Keyword-based smart routing
function detectBestProvider(query: string, settings: Settings): AIProvider {
  if (settings.preferredProvider !== 'auto') return settings.preferredProvider;

  const q = query.toLowerCase();

  // Real-time / current events → Grok
  if (
    /היום|עכשיו|חדשות|טוויטר|x\.com|ראיתי|ספורט|מזג|תוצאות/.test(q) ||
    /latest|news|today|current|twitter|weather|scores/.test(q)
  ) {
    if (settings.apiKeys.grok) return 'grok';
  }

  // Code / logic / analysis → Claude
  if (
    /קוד|תכנת|באג|פונקציה|אלגוריתם|פיתוח|explain|analyze|analysis|logic/.test(q) ||
    /debug|code|function|bug|algorithm|typescript|python|javascript/.test(q)
  ) {
    if (settings.apiKeys.anthropic) return 'claude';
  }

  // Vision / image described → OpenAI
  if (/תראה|ראה|מה יש|ראית|מה זה|look|see|image|vision|camera/.test(q)) {
    if (settings.apiKeys.openai) return 'openai';
  }

  // Long context / big document → Gemini
  if (/סכם|תסכם|מסמך|קובץ|ארוך|summarize|document|long|file/.test(q)) {
    if (settings.apiKeys.gemini) return 'gemini';
  }

  // Default priority order: claude → openai → gemini → grok
  const { anthropic, openai, gemini, grok } = settings.apiKeys;
  if (anthropic) return 'claude';
  if (openai) return 'openai';
  if (gemini) return 'gemini';
  if (grok) return 'grok';

  throw new Error('no_api_keys');
}

export async function routeToAI(
  query: string,
  messages: Message[],
  settings: Settings,
  imageBase64?: string
): Promise<{ response: string; provider: AIProvider }> {
  const provider = detectBestProvider(query, settings);
  const { apiKeys } = settings;

  let response = '';

  switch (provider) {
    case 'claude':
      response = await askClaude(messages, query, apiKeys.anthropic, imageBase64);
      break;
    case 'openai':
      response = await askOpenAI(messages, query, apiKeys.openai, imageBase64);
      break;
    case 'gemini':
      response = await askGemini(messages, query, apiKeys.gemini, imageBase64);
      break;
    case 'grok':
      response = await askGrok(messages, query, apiKeys.grok);
      break;
  }

  return { response, provider };
}
