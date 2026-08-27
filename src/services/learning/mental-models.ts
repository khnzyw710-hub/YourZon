import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_learning.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS mental_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    when_to_use TEXT,
    example TEXT,
    learned INTEGER DEFAULT 0,
    bookmarked INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS learning_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    topic TEXT NOT NULL,
    insights TEXT,
    questions TEXT,
    source TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MentalModel {
  id?: number;
  name: string;
  category: string;
  description: string;
  whenToUse?: string;
  example?: string;
  learned: boolean;
  bookmarked: boolean;
  createdAt: number;
}

export interface LearningJournal {
  id?: number;
  date: string;
  topic: string;
  insights?: string;
  questions?: string;
  source?: string;
  createdAt: number;
}

// ─── Built-in mental models library ──────────────────────────────────────────
const CORE_MENTAL_MODELS: Omit<MentalModel, 'id' | 'createdAt' | 'learned' | 'bookmarked'>[] = [
  {
    name: 'First Principles Thinking',
    category: 'reasoning',
    description: 'Break problems down to their fundamental truths and reason up from there.',
    whenToUse: 'When facing a complex problem where conventional wisdom may be limiting you.',
    example: 'Elon Musk applying it to reduce rocket costs by questioning every assumption.',
  },
  {
    name: 'Inversion',
    category: 'reasoning',
    description: 'Approach problems backward: instead of asking how to achieve X, ask what would prevent X.',
    whenToUse: 'When stuck on how to solve a problem or achieve a goal.',
    example: 'Instead of "how do I build a successful business?", ask "what would make it fail?"',
  },
  {
    name: "Occam's Razor",
    category: 'reasoning',
    description: 'Among competing explanations, prefer the simplest one that fits the evidence.',
    whenToUse: 'When analyzing situations with multiple possible explanations.',
    example: 'If your car won\'t start, check battery before assuming engine failure.',
  },
  {
    name: 'Second Order Thinking',
    category: 'decision-making',
    description: 'Think beyond immediate consequences to consider what happens next.',
    whenToUse: 'Before making decisions with significant long-term impact.',
    example: 'Antibiotics kill infections but may also create resistant bacteria.',
  },
  {
    name: 'Circle of Competence',
    category: 'self-awareness',
    description: 'Know the boundaries of your expertise. Stay within them or expand them deliberately.',
    whenToUse: 'When making decisions or evaluating opportunities.',
    example: 'Buffett investing only in businesses he can understand.',
  },
  {
    name: 'Map vs Territory',
    category: 'epistemology',
    description: 'Models and representations are not reality. The menu is not the meal.',
    whenToUse: 'When your models or assumptions may be disconnected from reality.',
    example: 'Financial models are useful but fail to predict real market behavior precisely.',
  },
  {
    name: 'Hanlon\'s Razor',
    category: 'reasoning',
    description: "Never attribute to malice what can be adequately explained by ignorance or incompetence.",
    whenToUse: 'When someone\'s actions seem harmful or frustrating.',
    example: 'A colleague misses a deadline — assume poor time management before assuming bad intent.',
  },
  {
    name: 'Pareto Principle (80/20)',
    category: 'productivity',
    description: '80% of results come from 20% of causes. Focus on high-leverage inputs.',
    whenToUse: 'When prioritizing tasks, customers, or features.',
    example: '20% of customers generate 80% of revenue — serve them best first.',
  },
];

// ─── Initialize mental models ─────────────────────────────────────────────────
export async function initMentalModels(): Promise<void> {
  const db = await getDB();
  for (const model of CORE_MENTAL_MODELS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO mental_models (name, category, description, when_to_use, example, learned, bookmarked, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
      [model.name, model.category, model.description, model.whenToUse ?? null, model.example ?? null, Date.now()]
    );
  }
}

export async function getMentalModels(category?: string): Promise<MentalModel[]> {
  const db = await getDB();
  const rows = category
    ? await db.getAllAsync<Record<string, any>>(`SELECT * FROM mental_models WHERE category = ? ORDER BY name`, [category])
    : await db.getAllAsync<Record<string, any>>(`SELECT * FROM mental_models ORDER BY bookmarked DESC, name`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    whenToUse: r.when_to_use ?? undefined,
    example: r.example ?? undefined,
    learned: r.learned === 1,
    bookmarked: r.bookmarked === 1,
    createdAt: r.created_at,
  }));
}

export async function markModelLearned(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE mental_models SET learned = 1 WHERE id = ?`, [id]);
}

export async function toggleBookmark(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(`UPDATE mental_models SET bookmarked = CASE WHEN bookmarked = 1 THEN 0 ELSE 1 END WHERE id = ?`, [id]);
}

// ─── AI learning features ─────────────────────────────────────────────────────
export async function applyMentalModelToSituation(modelName: string, situation: string, settings: Settings): Promise<string> {
  const db = await getDB();
  const model = await db.getFirstAsync<{ name: string; description: string; when_to_use: string | null }>(
    `SELECT name, description, when_to_use FROM mental_models WHERE name = ?`, [modelName]
  );

  const modelDesc = model
    ? `${model.name}: ${model.description}`
    : modelName;

  const prompt = `Apply the mental model "${modelDesc}" to this situation:
"${situation}"

Walk through how this mental model applies, what insights it reveals, and what actions it suggests.
Be specific and practical, not theoretical.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function suggestMentalModel(situation: string, settings: Settings): Promise<string> {
  const models = await getMentalModels();
  const modelList = models.map((m) => `${m.name}: ${m.description}`).slice(0, 15).join('\n');

  const prompt = `Suggest the most relevant mental model for this situation:
"${situation}"

Available models:
${modelList}

Choose the 1-2 most relevant models and explain WHY they apply (2-3 sentences each).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Learning journal ─────────────────────────────────────────────────────────
export async function addJournalEntry(entry: Omit<LearningJournal, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO learning_journal (date, topic, insights, questions, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [entry.date, entry.topic, entry.insights ?? null, entry.questions ?? null, entry.source ?? null, Date.now()]
  );
}

export async function getJournalEntries(limit = 20): Promise<LearningJournal[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM learning_journal ORDER BY date DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    topic: r.topic,
    insights: r.insights ?? undefined,
    questions: r.questions ?? undefined,
    source: r.source ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function generateLearningInsights(topic: string, notes: string, settings: Settings): Promise<string> {
  const prompt = `I just learned about "${topic}". Here are my notes:
${notes}

Help me deepen my understanding:
1. What's the core insight I should remember?
2. What common misconceptions should I watch out for?
3. How can I apply this in real life?
4. What should I learn next?`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
