import { Settings, Message } from '@/store';
import { routeToAI, routeToAIStream } from '@/services/ai/router';
import { executeTool, TOOL_MANIFEST } from '@/services/agent/tools';
import { consumeStream } from '@/services/ai/streaming';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentTask {
  id: number;
  description: string;
  dependsOn: number[];
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: string;
}

export interface AgentPlan {
  goal: string;
  tasks: AgentTask[];
  estimatedSteps: number;
}

export interface AgentProgress {
  phase: 'planning' | 'executing' | 'synthesizing' | 'done';
  completedTasks: number;
  totalTasks: number;
  currentTask: string;
  partialResult: string;
}

// ─── Complexity heuristics ────────────────────────────────────────────────────
const COMPLEX_PATTERNS = [
  /תארגן|plan|schedule|organize|book|reserve/i,
  /ואז|ולאחר מכן|then|after that|next|finally/i,
  /כמה שלבים|multiple steps|step by step/i,
  /שלח.+ועדכן|find.+and.+send|search.+and.+create/i,
  /\band\b.{5,}\band\b/i,
];

export function isComplexTask(query: string): boolean {
  return COMPLEX_PATTERNS.filter((p) => p.test(query)).length >= 2;
}

// ─── Task planner ─────────────────────────────────────────────────────────────
async function planTask(goal: string, settings: Settings): Promise<AgentTask[]> {
  const prompt = `You are a task planner. Decompose the following goal into 2-5 specific subtasks.
Respond ONLY with a JSON array, no explanation:

[
  { "id": 1, "description": "...", "dependsOn": [] },
  { "id": 2, "description": "...", "dependsOn": [1] }
]

Available tools: calendar, SMS, contacts, clipboard, location, memory, search.
Keep each task description short and actionable.

Goal: "${goal}"`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) return [{ id: 1, description: goal, dependsOn: [], status: 'pending' }];

    const parsed = JSON.parse(match[0]) as Array<{ id: number; description: string; dependsOn: number[] }>;
    return parsed.map((t) => ({ ...t, status: 'pending' as const }));
  } catch {
    return [{ id: 1, description: goal, dependsOn: [], status: 'pending' }];
  }
}

// ─── Single task executor ─────────────────────────────────────────────────────
async function executeTask(
  task: AgentTask,
  context: Record<number, string>,
  settings: Settings
): Promise<string> {
  const contextStr = Object.entries(context)
    .map(([id, result]) => `Task ${id} result: ${result}`)
    .join('\n');

  const prompt = `Execute this specific task and provide the result.
${contextStr ? `Previous results:\n${contextStr}\n\n` : ''}
Task: ${task.description}

${TOOL_MANIFEST}

If this task requires using a tool, respond with the JSON tool call.
Otherwise, provide the direct result as plain text.`;

  const { response } = await routeToAI(prompt, [], settings);

  // Check if the response is a tool call
  const toolMatch = response.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
  if (toolMatch) {
    try {
      const toolCall = JSON.parse(toolMatch[0]);
      if (toolCall.tool && toolCall.args) {
        const result = await executeTool({ name: toolCall.tool, args: toolCall.args });
        return result.output;
      }
    } catch {}
  }

  return response.trim();
}

// ─── Parallel executor respecting dependencies ────────────────────────────────
async function executeParallel(
  tasks: AgentTask[],
  settings: Settings,
  onProgress: (progress: Omit<AgentProgress, 'phase' | 'partialResult'>) => void
): Promise<Record<number, string>> {
  const results: Record<number, string> = {};
  const remaining = [...tasks];
  let completed = 0;

  while (remaining.length > 0) {
    // Find tasks whose dependencies are all satisfied
    const ready = remaining.filter((t) =>
      t.dependsOn.every((depId) => results[depId] !== undefined)
    );

    if (ready.length === 0) break; // deadlock guard

    // Execute all ready tasks in parallel
    await Promise.all(
      ready.map(async (task) => {
        const depContext: Record<number, string> = {};
        task.dependsOn.forEach((id) => { depContext[id] = results[id]; });

        onProgress({
          completedTasks: completed,
          totalTasks: tasks.length,
          currentTask: task.description,
        });

        try {
          const result = await executeTask(task, depContext, settings);
          results[task.id] = result;
        } catch (err: any) {
          results[task.id] = `Error: ${err?.message ?? 'failed'}`;
        }

        completed++;
        // Remove from remaining
        const idx = remaining.findIndex((t) => t.id === task.id);
        if (idx >= 0) remaining.splice(idx, 1);
      })
    );
  }

  return results;
}

// ─── Synthesizer — combines results into a final streaming response ────────────
async function* synthesizeResults(
  goal: string,
  tasks: AgentTask[],
  results: Record<number, string>,
  settings: Settings
): AsyncGenerator<string> {
  const resultsSummary = tasks
    .map((t) => `${t.description}: ${results[t.id] ?? 'no result'}`)
    .join('\n');

  const prompt = `You completed a multi-step task. Synthesize the results into a clear, conversational answer.
Be concise — this will be read aloud via TTS.

Original goal: "${goal}"

What was accomplished:
${resultsSummary}

Provide a 2-4 sentence natural summary of what was done and any important details.`;

  const { stream } = await routeToAIStream(prompt, [], settings);
  yield* stream;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function runMultiAgent(
  query: string,
  settings: Settings,
  onProgress: (progress: AgentProgress) => void,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void | Promise<void>
): Promise<void> {
  // Phase 1: Planning
  onProgress({ phase: 'planning', completedTasks: 0, totalTasks: 0, currentTask: 'מתכנן...', partialResult: '' });

  const tasks = await planTask(query, settings);

  // Phase 2: Executing
  let fullPartial = '';
  const results = await executeParallel(tasks, settings, ({ completedTasks, totalTasks, currentTask }) => {
    onProgress({ phase: 'executing', completedTasks, totalTasks, currentTask, partialResult: fullPartial });
  });

  // Phase 3: Synthesizing
  onProgress({ phase: 'synthesizing', completedTasks: tasks.length, totalTasks: tasks.length, currentTask: 'מסכם...', partialResult: '' });

  let fullText = '';
  const stream = synthesizeResults(query, tasks, results, settings);
  await consumeStream(
    stream,
    (text) => {
      fullPartial = text;
      onChunk(text);
      onProgress({ phase: 'synthesizing', completedTasks: tasks.length, totalTasks: tasks.length, currentTask: 'מסכם...', partialResult: text });
    },
    async () => {},
    async (full) => {
      fullText = full;
      await onDone(full);
      onProgress({ phase: 'done', completedTasks: tasks.length, totalTasks: tasks.length, currentTask: 'הושלם', partialResult: full });
    }
  );
}
