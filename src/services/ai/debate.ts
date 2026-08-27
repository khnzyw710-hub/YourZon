import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DebatePosition {
  stance: 'pro' | 'con';
  argument: string;
  confidence: number;
  sources: string[];
}

export interface DebateResult {
  topic: string;
  pro: DebatePosition;
  con: DebatePosition;
  verdict: string;
  confidence: number;
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'uncertain' | 'partially_true';
  explanation: string;
  confidence: number;
  citations: string[];
}

export interface ParallelFanOutResult {
  query: string;
  responses: Array<{ provider: string; response: string; latencyMs: number }>;
  synthesized: string;
}

// ─── Confidence scoring ───────────────────────────────────────────────────────
export function scoreConfidence(response: string): number {
  const certaintyMarkers = ['definitely', 'certainly', 'clearly', 'absolutely', 'without doubt', 'בוודאות', 'ללא ספק'];
  const uncertaintyMarkers = ['maybe', 'perhaps', 'possibly', 'might', 'could be', 'אולי', 'ייתכן', 'not sure', 'approximately'];

  let score = 0.7; // baseline
  const lower = response.toLowerCase();

  for (const m of certaintyMarkers) {
    if (lower.includes(m)) score = Math.min(0.95, score + 0.05);
  }
  for (const m of uncertaintyMarkers) {
    if (lower.includes(m)) score = Math.max(0.3, score - 0.1);
  }

  // Length heuristic: longer, more detailed = more confident
  if (response.length > 500) score = Math.min(0.9, score + 0.05);

  return Math.round(score * 100) / 100;
}

// ─── Debate mode ──────────────────────────────────────────────────────────────
export async function runDebate(topic: string, settings: Settings): Promise<DebateResult> {
  const proPrompt = `You are arguing strongly FOR: "${topic}". Give 3 compelling arguments. Be direct and persuasive. List any sources or evidence.`;
  const conPrompt = `You are arguing strongly AGAINST: "${topic}". Give 3 compelling arguments. Be direct and persuasive. List any sources or evidence.`;

  const [proResult, conResult] = await Promise.allSettled([
    routeToAI(proPrompt, [], settings),
    routeToAI(conPrompt, [], settings),
  ]);

  const proText = proResult.status === 'fulfilled' ? proResult.value.response : 'Could not generate pro argument.';
  const conText = conResult.status === 'fulfilled' ? conResult.value.response : 'Could not generate con argument.';

  const verdictPrompt = `Given these arguments about "${topic}":
PRO: ${proText}
CON: ${conText}
Provide a balanced 2-sentence verdict. Which side has stronger evidence?`;

  const { response: verdict } = await routeToAI(verdictPrompt, [], settings);

  return {
    topic,
    pro: {
      stance: 'pro',
      argument: proText,
      confidence: scoreConfidence(proText),
      sources: extractMentionedSources(proText),
    },
    con: {
      stance: 'con',
      argument: conText,
      confidence: scoreConfidence(conText),
      sources: extractMentionedSources(conText),
    },
    verdict,
    confidence: scoreConfidence(verdict),
  };
}

// ─── Fact checking ────────────────────────────────────────────────────────────
export async function factCheck(claim: string, settings: Settings): Promise<FactCheckResult> {
  const prompt = `Fact-check this claim: "${claim}"

Respond in JSON:
{
  "verdict": "true" | "false" | "uncertain" | "partially_true",
  "explanation": "...",
  "confidence": 0.0-1.0,
  "citations": ["source1", "source2"]
}

Be concise and objective.`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        claim,
        verdict: parsed.verdict ?? 'uncertain',
        explanation: parsed.explanation ?? response,
        confidence: parsed.confidence ?? 0.5,
        citations: parsed.citations ?? [],
      };
    }
  } catch {}

  return {
    claim,
    verdict: 'uncertain',
    explanation: 'Could not verify this claim.',
    confidence: 0.3,
    citations: [],
  };
}

// ─── Citation extraction ──────────────────────────────────────────────────────
export function extractCitations(text: string): string[] {
  const citations: string[] = [];

  // Match URLs
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const urls = text.match(urlPattern) ?? [];
  citations.push(...urls);

  // Match "According to [Source]" patterns
  const sourcePattern = /(?:according to|source:|cited in|from)\s+([^,.\n]{5,50})/gi;
  let m: RegExpExecArray | null;
  while ((m = sourcePattern.exec(text)) !== null) {
    citations.push(m[1].trim());
  }

  return [...new Set(citations)].slice(0, 10);
}

function extractMentionedSources(text: string): string[] {
  const orgs = ['Wikipedia', 'WHO', 'CDC', 'NIH', 'UN', 'NASA', 'MIT', 'Harvard', 'Oxford'];
  const found: string[] = [];
  for (const org of orgs) {
    if (text.toLowerCase().includes(org.toLowerCase())) found.push(org);
  }
  return found;
}

// ─── Parallel fan-out: ask all providers simultaneously ─────────────────────
export async function parallelFanOut(
  query: string,
  settings: Settings,
  providers: Array<'claude' | 'openai' | 'gemini' | 'grok'> = ['claude', 'openai', 'gemini']
): Promise<ParallelFanOutResult> {
  const results = await Promise.allSettled(
    providers.map(async (provider) => {
      const start = Date.now();
      const fakeSettings = { ...settings, preferredProvider: provider as any, smartRoute: false, raceMode: false };
      const { response } = await routeToAI(query, [], fakeSettings);
      return { provider, response, latencyMs: Date.now() - start };
    })
  );

  const responses = results
    .filter((r): r is PromiseFulfilledResult<{ provider: string; response: string; latencyMs: number }> => r.status === 'fulfilled')
    .map((r) => r.value);

  let synthesized = '';
  if (responses.length > 1) {
    const synPrompt = `You received these ${responses.length} AI responses to the same query: "${query}"

${responses.map((r, i) => `[${r.provider.toUpperCase()}]: ${r.response}`).join('\n\n')}

Synthesize the best answer in 2-3 sentences, incorporating the strongest points from each.`;
    const { response } = await routeToAI(synPrompt, [], settings).catch(() => ({ response: responses[0]?.response ?? '' }));
    synthesized = response;
  } else {
    synthesized = responses[0]?.response ?? '';
  }

  return { query, responses, synthesized };
}

// ─── Specialist routing ───────────────────────────────────────────────────────
export type SpecialistDomain = 'medical' | 'legal' | 'financial' | 'technical' | 'creative' | 'scientific';

const SPECIALIST_PROMPTS: Record<SpecialistDomain, string> = {
  medical: 'You are a knowledgeable medical information assistant. Provide accurate health information and always recommend consulting a licensed physician for personal medical decisions.',
  legal: 'You are a knowledgeable legal information assistant familiar with Israeli and international law. Provide legal information and always recommend consulting a licensed attorney for personal legal matters.',
  financial: 'You are a knowledgeable financial advisor assistant. Provide financial insights and always recommend consulting a certified financial planner for personal investment decisions.',
  technical: 'You are an expert software engineer and systems architect. Provide precise, practical technical guidance.',
  creative: 'You are a creative director with expertise in storytelling, design, and artistic expression. Provide imaginative, inspiring guidance.',
  scientific: 'You are a research scientist with expertise across physics, biology, chemistry, and data analysis. Provide evidence-based, rigorous scientific information.',
};

export async function askSpecialist(
  domain: SpecialistDomain,
  query: string,
  settings: Settings
): Promise<string> {
  const systemContext = SPECIALIST_PROMPTS[domain];
  const prompt = `${systemContext}\n\nUser question: ${query}`;
  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export function detectSpecialistDomain(query: string): SpecialistDomain | null {
  const lower = query.toLowerCase();

  const patterns: Array<[SpecialistDomain, RegExp]> = [
    ['medical', /symptom|disease|medication|doctor|health|pain|fever|blood|heart|medical|רפואי|תרופה|רופא|כאב/i],
    ['legal', /law|legal|contract|court|rights|attorney|lawyer|חוק|עורך דין|חוזה|בית משפט|זכות/i],
    ['financial', /invest|stock|tax|budget|money|finance|bank|loan|mortgage|השקעה|מניה|מס|תקציב|כסף|בנק|הלוואה/i],
    ['technical', /code|program|bug|API|server|database|algorithm|function|error|קוד|תכנות|שגיאה|אלגוריתם/i],
    ['scientific', /physics|chemistry|biology|research|experiment|hypothesis|quantum|molecule|פיזיקה|כימיה|ביולוגיה/i],
    ['creative', /story|poem|design|art|creative|write|novel|screenplay|סיפור|שיר|עיצוב|אמנות|כתיבה/i],
  ];

  for (const [domain, pattern] of patterns) {
    if (pattern.test(lower)) return domain;
  }
  return null;
}
