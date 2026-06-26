import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Productivity tool integrations via deep links & APIs ─────────────────────
// Integration strategy: deep links for installed apps, REST for web services

export type ProductivityTool = 'notion' | 'trello' | 'asana' | 'todoist' | 'google_docs' | 'notion_quick' | 'obsidian';

// ─── Notion integration (deep links + unofficial API support) ─────────────────
export function buildNotionDeepLink(action: 'new_page' | 'search' | 'open', params?: Record<string, string>): string {
  switch (action) {
    case 'new_page': return `notion://new-page`;
    case 'search': return `notion://search`;
    case 'open': return `notion://open?url=${encodeURIComponent(params?.url ?? '')}`;
    default: return 'notion://';
  }
}

export async function generateNotionPageContent(
  title: string,
  type: 'meeting_notes' | 'project_brief' | 'daily_log' | 'idea' | 'research',
  context: string,
  settings: Settings
): Promise<string> {
  const templates = {
    meeting_notes: '# Meeting Notes\n## Attendees\n## Agenda\n## Discussion\n## Action Items\n## Next Steps',
    project_brief: '# Project Brief\n## Overview\n## Goals\n## Scope\n## Timeline\n## Resources\n## Risks',
    daily_log: '# Daily Log\n## Done Today\n## In Progress\n## Blocked\n## Tomorrow',
    idea: '# Idea\n## The Concept\n## Problem It Solves\n## How It Works\n## Next Steps',
    research: '# Research Notes\n## Topic\n## Key Findings\n## Sources\n## Questions\n## Conclusions',
  };

  const template = templates[type];
  const prompt = `Fill in this Notion template for "${title}":
${template}

Context: ${context}

Fill in realistic, useful content for each section. Keep it concise but complete.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Google Docs integration (deep links) ─────────────────────────────────────
export function buildGoogleDocsLink(action: 'new' | 'open', docId?: string): string {
  if (action === 'new') return 'https://docs.google.com/document/create';
  if (action === 'open' && docId) return `https://docs.google.com/document/d/${docId}/edit`;
  return 'https://docs.google.com';
}

// ─── Trello integration (deep links) ─────────────────────────────────────────
export function buildTrelloLink(action: 'board' | 'new_card' | 'open'): string {
  return action === 'new_card' ? 'trello://x-callback-url/createCard' : 'https://trello.com';
}

// ─── Todoist integration ──────────────────────────────────────────────────────
export function buildTodoistLink(action: 'new_task' | 'open', content?: string): string {
  if (action === 'new_task' && content) {
    return `todoist://addtask?content=${encodeURIComponent(content)}`;
  }
  return 'todoist://';
}

// ─── AI-powered task import/export ───────────────────────────────────────────
export async function exportTasksToCSV(tasks: Array<{ title: string; priority: number; dueDate?: string; status: string }>): Promise<string> {
  const header = 'Title,Priority,Due Date,Status';
  const rows = tasks.map((t) => `"${t.title}",${t.priority},"${t.dueDate ?? ''}","${t.status}"`);
  return [header, ...rows].join('\n');
}

export async function importTasksFromText(text: string, settings: Settings): Promise<Array<{
  title: string;
  priority: number;
  dueDate?: string;
  description?: string;
}>> {
  const prompt = `Extract a list of tasks from this text:
${text.slice(0, 3000)}

Respond with JSON array:
[{"title": "task", "priority": 1-4, "dueDate": "YYYY-MM-DD or null", "description": "details or null"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

// ─── Obsidian integration (deep links) ───────────────────────────────────────
export function buildObsidianLink(vault: string, action: 'new' | 'open' | 'search', params?: { note?: string; content?: string }): string {
  const base = `obsidian://`;
  if (action === 'new') {
    const q = new URLSearchParams({ vault, name: params?.note ?? 'New Note', content: params?.content ?? '' });
    return `${base}new?${q.toString()}`;
  }
  if (action === 'open' && params?.note) {
    const q = new URLSearchParams({ vault, file: params.note });
    return `${base}open?${q.toString()}`;
  }
  if (action === 'search') {
    const q = new URLSearchParams({ vault, query: params?.note ?? '' });
    return `${base}search?${q.toString()}`;
  }
  return `${base}open?vault=${encodeURIComponent(vault)}`;
}

// ─── Cross-tool automation ────────────────────────────────────────────────────
export async function generateCrossToolWorkflow(goal: string, availableTools: ProductivityTool[], settings: Settings): Promise<string> {
  const prompt = `Design a workflow to achieve: "${goal}"
Available tools: ${availableTools.join(', ')}

Create a step-by-step workflow showing how to use these tools together. Be specific about what goes in each tool and why.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
