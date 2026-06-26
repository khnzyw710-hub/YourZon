import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Memory enhancement techniques ────────────────────────────────────────────
// All techniques based on evidence-based cognitive science

export type MemoryTechnique =
  | 'palace_of_memory'
  | 'chunking'
  | 'acronym'
  | 'story_method'
  | 'spaced_repetition'
  | 'elaborative_interrogation'
  | 'interleaving'
  | 'mind_map';

export interface MemoryAid {
  technique: MemoryTechnique;
  original: string;
  mnemonic: string;
  reviewSchedule?: string[];
  explanation?: string;
}

const TECHNIQUE_DESCRIPTIONS: Record<MemoryTechnique, string> = {
  palace_of_memory: 'Place items along a familiar mental path you can walk through',
  chunking: 'Group information into meaningful clusters of 3-7 items',
  acronym: 'Create a word or sentence from the first letters of each item',
  story_method: 'Weave items into a memorable, vivid narrative',
  spaced_repetition: 'Review at increasing intervals: 1 day, 3 days, 1 week, 2 weeks',
  elaborative_interrogation: 'Ask WHY each fact is true to deepen encoding',
  interleaving: 'Mix different topics during study instead of blocking by subject',
  mind_map: 'Create a visual tree connecting central concept to branches',
};

export async function createMnemonic(
  content: string,
  technique: MemoryTechnique,
  settings: Settings
): Promise<MemoryAid> {
  const prompt = `Create a ${technique.replace(/_/g, ' ')} mnemonic for: "${content}"

Technique: ${TECHNIQUE_DESCRIPTIONS[technique]}

Respond with JSON:
{
  "mnemonic": "the mnemonic device itself",
  "explanation": "brief explanation of how it works"
}`;

  let mnemonic = content;
  let explanation = '';

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      mnemonic = parsed.mnemonic;
      explanation = parsed.explanation;
    }
  } catch {}

  const reviewSchedule = ['Tomorrow', 'In 3 days', 'In 1 week', 'In 2 weeks', 'In 1 month'];

  return { technique, original: content, mnemonic, reviewSchedule, explanation };
}

export async function buildMemoryPalace(
  items: string[],
  location: string,
  settings: Settings
): Promise<Array<{ item: string; placement: string; vivid: string }>> {
  const prompt = `Build a memory palace for ${items.length} items in: "${location}"

Items to remember:
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}

For each item, create a specific location spot within "${location}" and a VIVID, bizarre, memorable image.

Respond with JSON array:
[{"item": "original item", "placement": "specific spot in ${location}", "vivid": "bizarre memorable image"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return items.map((item, i) => ({
    item,
    placement: `Location ${i + 1} in ${location}`,
    vivid: item,
  }));
}

export async function generateAcronym(
  items: string[],
  language: 'he' | 'en',
  settings: Settings
): Promise<{ acronym: string; sentence: string }> {
  const firstLetters = items.map((item) => item.charAt(0).toUpperCase()).join('');
  const prompt = `Create a memorable acronym or sentence from these letters: ${firstLetters}
Language: ${language === 'he' ? 'Hebrew' : 'English'}
Original items: ${items.join(', ')}

Respond with JSON:
{"acronym": "the word or abbreviation", "sentence": "optional memorable sentence using the letters"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { acronym: firstLetters, sentence: firstLetters };
}

export async function getStudyTechniqueTips(
  subject: string,
  currentLevel: 'beginner' | 'intermediate' | 'advanced',
  settings: Settings
): Promise<string> {
  const prompt = `Give 5 evidence-based study techniques for learning: "${subject}"
Current level: ${currentLevel}

Focus on: retrieval practice, spacing effect, and deep processing strategies.
Be specific and actionable.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export function getSpacedRepetitionSchedule(initialDate: Date): string[] {
  const schedule: string[] = [];
  const intervals = [1, 3, 7, 14, 30, 60, 120];
  for (const days of intervals) {
    const d = new Date(initialDate.getTime() + days * 86400000);
    schedule.push(d.toISOString().slice(0, 10));
  }
  return schedule;
}
