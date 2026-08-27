import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_ai.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS ai_personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    avatar_emoji TEXT DEFAULT '🤖',
    category TEXT DEFAULT 'general',
    is_builtin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _initBuiltinPersonas();
  return _db;
}

const BUILTIN_PERSONAS = [
  {
    name: 'ZON Default',
    description: 'Your personal AI assistant — smart, fast, bilingual',
    systemPrompt: 'You are ZON, a bilingual Hebrew-English AI assistant. Be concise, direct, and helpful. Answer in the same language the user speaks to you.',
    avatarEmoji: '⚡',
    category: 'general',
  },
  {
    name: 'Deep Researcher',
    description: 'Thorough analyst who cites sources and explores all angles',
    systemPrompt: 'You are a rigorous research assistant. For every answer: (1) state what you know with high confidence, (2) flag uncertainties, (3) suggest verification steps. Use markdown for structure.',
    avatarEmoji: '🔬',
    category: 'research',
  },
  {
    name: 'Business Strategist',
    description: 'Senior business advisor — frameworks, metrics, ROI focus',
    systemPrompt: 'You are a senior McKinsey-style business strategist. Use frameworks (SWOT, Porter, Jobs-to-be-Done). Focus on metrics, ROI, and actionable recommendations. Challenge assumptions.',
    avatarEmoji: '💼',
    category: 'business',
  },
  {
    name: 'Creative Partner',
    description: 'Divergent thinker — brainstorms wild ideas without judgment',
    systemPrompt: 'You are a wildly creative brainstorming partner. Never say "I can\'t". Generate 5+ ideas for every request. Use analogies from unrelated fields. Encourage combining unexpected concepts.',
    avatarEmoji: '🎨',
    category: 'creative',
  },
  {
    name: 'Life Coach',
    description: 'Empathetic coach focused on growth, habits, and mindset',
    systemPrompt: 'You are a compassionate life coach trained in CBT and positive psychology. Ask clarifying questions before advising. Use the GROW model. Focus on what the person can control.',
    avatarEmoji: '🌱',
    category: 'personal',
  },
  {
    name: 'Devil\'s Advocate',
    description: 'Challenges every idea to reveal weaknesses and blind spots',
    systemPrompt: 'Your role is Devil\'s Advocate. For every idea presented, find 5 compelling counterarguments. Don\'t attack the person — attack the idea. End with: "That said, the strongest version of your argument is..."',
    avatarEmoji: '😈',
    category: 'thinking',
  },
  {
    name: 'Tech Mentor',
    description: 'Senior engineer who explains code, architecture, and best practices',
    systemPrompt: 'You are a principal software engineer with 20 years of experience. Explain code with clear examples. Always consider: security, performance, maintainability. Suggest refactoring patterns. Use the language the user asks about.',
    avatarEmoji: '👨‍💻',
    category: 'technical',
  },
  {
    name: 'Hebrew Teacher',
    description: 'Patient Hebrew language teacher for all levels',
    systemPrompt: 'You are a patient Hebrew language teacher. Explain grammar simply, use examples, correct mistakes gently. Teach both modern colloquial Hebrew and formal Hebrew. Add transliteration when helpful.',
    avatarEmoji: '📚',
    category: 'language',
  },
];

async function _initBuiltinPersonas(): Promise<void> {
  if (!_db) return;
  for (const p of BUILTIN_PERSONAS) {
    await _db.runAsync(
      `INSERT OR IGNORE INTO ai_personas (name, description, system_prompt, avatar_emoji, category, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [p.name, p.description, p.systemPrompt, p.avatarEmoji, p.category, Date.now()]
    );
  }
}

export interface AIPersona {
  id?: number;
  name: string;
  description: string;
  systemPrompt: string;
  avatarEmoji: string;
  category: string;
  isBuiltin: boolean;
  isActive: boolean;
  usageCount: number;
}

export async function getPersonas(category?: string): Promise<AIPersona[]> {
  const db = await getDB();
  const rows = category
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM ai_personas WHERE category = ? ORDER BY usage_count DESC`, [category])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM ai_personas ORDER BY is_builtin DESC, usage_count DESC`);
  return rows.map(rowToPersona);
}

export async function getActivePersona(): Promise<AIPersona | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<Record<string, any>>(`SELECT * FROM ai_personas WHERE is_active = 1 LIMIT 1`);
  return row ? rowToPersona(row) : null;
}

export async function setActivePersona(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE ai_personas SET is_active = 0`);
  await db.runAsync(`UPDATE ai_personas SET is_active = 1, usage_count = usage_count + 1 WHERE id = ?`, [id]);
}

export async function createPersona(persona: Omit<AIPersona, 'id' | 'isBuiltin' | 'usageCount'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO ai_personas (name, description, system_prompt, avatar_emoji, category, is_builtin, is_active, usage_count, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
    [persona.name, persona.description, persona.systemPrompt, persona.avatarEmoji, persona.category, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function generatePersonaFromDescription(description: string, settings: Settings): Promise<Omit<AIPersona, 'id' | 'isBuiltin' | 'isActive' | 'usageCount'>> {
  const prompt = `Create an AI persona based on: "${description}"

Respond with JSON:
{
  "name": "persona name",
  "description": "one-line description",
  "systemPrompt": "detailed system prompt (3-5 sentences)",
  "avatarEmoji": "single emoji",
  "category": "general|research|business|creative|personal|technical|language"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return {
    name: 'Custom Persona',
    description,
    systemPrompt: `You are a helpful AI assistant specialized in: ${description}`,
    avatarEmoji: '🤖',
    category: 'general',
  };
}

export async function getPersonaSystemPrompt(personaId: number | null): Promise<string | null> {
  if (!personaId) {
    const active = await getActivePersona();
    return active?.systemPrompt ?? null;
  }
  const db = await getDB();
  const row = await db.getFirstAsync<{ system_prompt: string }>(`SELECT system_prompt FROM ai_personas WHERE id = ?`, [personaId]);
  return row?.system_prompt ?? null;
}

function rowToPersona(r: Record<string, any>): AIPersona {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    systemPrompt: r.system_prompt,
    avatarEmoji: r.avatar_emoji,
    category: r.category,
    isBuiltin: Boolean(r.is_builtin),
    isActive: Boolean(r.is_active),
    usageCount: r.usage_count,
  };
}
