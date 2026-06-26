import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Multi-format content summarizer ─────────────────────────────────────────

export type SummaryLength = 'one_line' | 'brief' | 'detailed' | 'comprehensive';
export type SummaryFormat = 'prose' | 'bullets' | 'numbered' | 'tldr' | 'eli5' | 'executive';

export interface SummaryOptions {
  length: SummaryLength;
  format: SummaryFormat;
  language: 'he' | 'en' | 'auto';
  audienceLevel: 'general' | 'expert';
  includeKeyPoints: boolean;
  includeActionItems: boolean;
}

const DEFAULT_OPTIONS: SummaryOptions = {
  length: 'brief',
  format: 'bullets',
  language: 'auto',
  audienceLevel: 'general',
  includeKeyPoints: true,
  includeActionItems: false,
};

const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  one_line: 'in ONE sentence (under 30 words)',
  brief: 'in 2-3 sentences or 3-5 bullets',
  detailed: 'in a well-structured paragraph with 5-8 key points',
  comprehensive: 'comprehensively with sections, key insights, and nuances',
};

const FORMAT_INSTRUCTIONS: Record<SummaryFormat, string> = {
  prose: 'as flowing prose',
  bullets: 'as concise bullet points',
  numbered: 'as numbered list with the most important first',
  tldr: 'as TL;DR — start with "TL;DR:" then one sentence',
  eli5: "as if explaining to a smart 12-year-old (simple words, no jargon)",
  executive: 'as an executive summary with: Situation, Key Findings, Recommended Actions',
};

export async function summarizeText(
  text: string,
  options: Partial<SummaryOptions> = {},
  settings: Settings
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const langInstr = opts.language === 'he' ? 'Respond in Hebrew.' : opts.language === 'en' ? 'Respond in English.' : 'Match the language of the input.';

  const extras: string[] = [];
  if (opts.includeKeyPoints && opts.format !== 'executive') extras.push('End with "Key Points:" and 3 bullet points');
  if (opts.includeActionItems) extras.push('Include "Action Items:" section');

  const prompt = `Summarize the following content ${LENGTH_INSTRUCTIONS[opts.length]}, formatted ${FORMAT_INSTRUCTIONS[opts.format]}.
Audience: ${opts.audienceLevel}.
${langInstr}
${extras.join('\n')}

Content:
${text.slice(0, 8000)}`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function summarizeConversation(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  settings: Settings
): Promise<string> {
  if (messages.length === 0) return '';

  const conversation = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
  return summarizeText(conversation, { length: 'brief', format: 'bullets', includeActionItems: true }, settings);
}

export async function extractKeyTakeaways(text: string, count = 5, settings: Settings): Promise<string[]> {
  const prompt = `Extract exactly ${count} key takeaways from:
${text.slice(0, 5000)}

Respond ONLY with a JSON array of strings:
["takeaway 1", "takeaway 2", ...]

Each takeaway should be one sentence, actionable or insightful.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

export async function compareAndContrast(
  item1: string,
  item2: string,
  aspects: string[],
  settings: Settings
): Promise<Array<{ aspect: string; item1: string; item2: string; winner?: string }>> {
  const aspectList = aspects.join(', ');
  const prompt = `Compare and contrast:
A: "${item1}"
B: "${item2}"

For each aspect: ${aspectList}

Respond with JSON array:
[{"aspect": "...", "item1": "how A performs", "item2": "how B performs", "winner": "A|B|tie"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

export async function generateFAQ(content: string, count = 5, settings: Settings): Promise<Array<{
  question: string;
  answer: string;
}>> {
  const prompt = `Generate ${count} frequently asked questions (and answers) based on:
${content.slice(0, 4000)}

Respond with JSON array:
[{"question": "...", "answer": "..."}]

Make questions natural, as a curious person would ask.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

export async function detectContentType(text: string, settings: Settings): Promise<{
  type: string;
  confidence: number;
  bestSummaryFormat: SummaryFormat;
}> {
  const prompt = `Classify this content type:
"${text.slice(0, 500)}"

Types: news_article, research_paper, meeting_notes, legal_document, product_review, recipe, code, conversation, book_excerpt, email, other

Respond with JSON:
{"type": "content_type", "confidence": 0-1, "bestSummaryFormat": "prose|bullets|numbered|tldr|executive"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { type: 'other', confidence: 0.5, bestSummaryFormat: 'bullets' };
}
