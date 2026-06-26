import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Structured problem-solving frameworks ─────────────────────────────────────

export type ProblemFramework =
  | 'five_whys'
  | 'design_thinking'
  | 'pdca'
  | 'scamper'
  | 'six_thinking_hats'
  | 'fishbone'
  | 'decision_matrix'
  | 'premortem';

export interface ProblemSolvingResult {
  framework: ProblemFramework;
  problem: string;
  analysis: Record<string, any>;
  recommendations: string[];
  nextSteps: string[];
}

const FRAMEWORK_PROMPTS: Record<ProblemFramework, (problem: string) => string> = {
  five_whys: (p) => `Apply the 5 Whys technique to: "${p}"
Ask WHY 5 times to find the root cause.
Format as: Why 1 → Why 2 → Why 3 → Why 4 → Why 5 → Root Cause
Then give 3 actionable solutions.`,

  design_thinking: (p) => `Apply Design Thinking to: "${p}"
Cover all 5 stages: Empathize, Define, Ideate, Prototype, Test.
For each stage, give 2-3 specific actions.`,

  pdca: (p) => `Apply PDCA cycle to: "${p}"
Plan: What specifically to do
Do: Implementation steps
Check: How to measure success
Act: How to standardize if successful`,

  scamper: (p) => `Apply SCAMPER to improve/solve: "${p}"
For each letter: Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse
Generate at least 1 idea per letter.`,

  six_thinking_hats: (p) => `Apply Six Thinking Hats to: "${p}"
White (facts), Red (emotions/intuition), Black (risks), Yellow (benefits), Green (creativity), Blue (process)
Give 2-3 insights per hat.`,

  fishbone: (p) => `Create a Fishbone (Ishikawa) diagram analysis for: "${p}"
Categories: People, Process, Technology, Environment, Materials, Management
List 2-3 potential causes per category.`,

  decision_matrix: (p) => `Create a decision matrix for: "${p}"
Identify 3-5 options and 4-6 criteria.
Score each option 1-5 on each criterion.
Show the weighted total and recommendation.`,

  premortem: (p) => `Run a Pre-Mortem for: "${p}"
Imagine it's 1 year from now and this project/decision FAILED.
1. List 5 most likely reasons for failure
2. For each: probability (low/med/high) + prevention strategy
3. Overall go/no-go recommendation`,
};

export async function applyFramework(
  problem: string,
  framework: ProblemFramework,
  settings: Settings
): Promise<ProblemSolvingResult> {
  const prompt = FRAMEWORK_PROMPTS[framework](problem);
  const { response } = await routeToAI(prompt, [], settings);

  // Extract structured data best-effort
  const lines = response.split('\n').filter((l) => l.trim());
  const recommendations: string[] = [];
  const nextSteps: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('recommend') || lower.includes('solution') || lower.startsWith('- ')) {
      if (recommendations.length < 5) recommendations.push(line.replace(/^[-•*]\s*/, '').trim());
    }
    if (lower.includes('next step') || lower.includes('action') || /^\d+\./.test(line)) {
      if (nextSteps.length < 5) nextSteps.push(line.replace(/^\d+\.\s*/, '').trim());
    }
  }

  return {
    framework,
    problem,
    analysis: { fullResponse: response },
    recommendations: recommendations.length ? recommendations : [response.slice(0, 200)],
    nextSteps: nextSteps.length ? nextSteps : ['Review the analysis above and identify the most critical action'],
  };
}

export async function selectBestFramework(
  problem: string,
  settings: Settings
): Promise<{ framework: ProblemFramework; reason: string }> {
  const prompt = `Which problem-solving framework is BEST for: "${problem}"?
Options: five_whys, design_thinking, pdca, scamper, six_thinking_hats, fishbone, decision_matrix, premortem

Respond with JSON:
{"framework": "framework_name", "reason": "one sentence why"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { framework: 'five_whys', reason: 'The 5 Whys is a universal starting point for finding root causes.' };
}

export async function generateAlternatives(
  decision: string,
  constraints: string[],
  settings: Settings
): Promise<Array<{ option: string; pros: string[]; cons: string[] }>> {
  const constraintText = constraints.length ? `\nConstraints: ${constraints.join(', ')}` : '';
  const prompt = `Generate 4 alternative approaches for: "${decision}"${constraintText}

For each alternative:
- Name
- 2-3 pros
- 2-3 cons

Respond with JSON array:
[{"option": "...", "pros": ["...", "..."], "cons": ["...", "..."]}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

export async function facilitateDeepThinking(
  topic: string,
  perspective: string,
  settings: Settings
): Promise<string> {
  const prompt = `Act as a Socratic dialogue partner on: "${topic}"

My current perspective: ${perspective}

Challenge my assumptions with:
1. Three probing questions that reveal hidden assumptions
2. A counterargument I haven't considered
3. An analogy from a completely different domain
4. What would change my mind?`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
