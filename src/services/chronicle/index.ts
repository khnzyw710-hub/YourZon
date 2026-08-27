import * as SQLite from 'expo-sqlite';
import { format, startOfDay, isToday } from 'date-fns';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_chronicle.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      key_topics TEXT NOT NULL DEFAULT '[]',
      people_mentioned TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      interaction_count INTEGER DEFAULT 1,
      last_seen INTEGER NOT NULL,
      topics TEXT NOT NULL DEFAULT '[]',
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS skill_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      context TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hour INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      topic TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      UNIQUE(hour, day_of_week, topic) ON CONFLICT REPLACE
    );
    CREATE TABLE IF NOT EXISTS conversation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_msg TEXT NOT NULL,
      ai_msg TEXT NOT NULL,
      provider TEXT,
      topics TEXT NOT NULL DEFAULT '[]',
      people TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface JournalEntry {
  date: string;
  content: string;
  keyTopics: string[];
  peopleMentioned: string[];
  createdAt: number;
}

export interface Relationship {
  id: number;
  name: string;
  interactionCount: number;
  lastSeen: number;
  topics: string[];
  notes: string;
}

export interface SkillNode {
  topic: string;
  count: number;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

// ─── Entity extraction (lightweight regex-based) ──────────────────────────────
const NAME_PATTERNS = [
  /(?:עם|של|ל|מ|דיברתי עם|פגשתי את|שלחתי ל)\s+([א-ת]{2,8}(?:\s+[א-ת]{2,8})?)/g,
  /(?:with|spoke with|met|talked to|called|emailed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
];

const TOPIC_PATTERNS = /\b(קוד|פרויקט|עבודה|אוכל|בריאות|ספורט|כסף|נסיעה|משפחה|חברים|code|work|food|health|sports|money|travel|family|friends|meeting|design|marketing|sales)\b/gi;

function extractPeople(text: string): string[] {
  const people: string[] = [];
  for (const pattern of NAME_PATTERNS) {
    const pat = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text)) !== null) {
      const name = m[1].trim();
      if (name.length > 1 && !people.includes(name)) people.push(name);
    }
  }
  return people.slice(0, 5);
}

function extractTopics(text: string): string[] {
  const matches = text.matchAll(TOPIC_PATTERNS);
  const topics = [...new Set([...matches].map((m) => m[0].toLowerCase()))];
  return topics.slice(0, 6);
}

// ─── Record a conversation exchange ───────────────────────────────────────────
export async function recordConversation(
  userMsg: string,
  aiMsg: string,
  provider?: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const people = extractPeople(userMsg + ' ' + aiMsg);
  const topics = extractTopics(userMsg + ' ' + aiMsg);

  await db.runAsync(
    'INSERT INTO conversation_log (user_msg, ai_msg, provider, topics, people, created_at) VALUES (?,?,?,?,?,?)',
    [userMsg.slice(0, 500), aiMsg.slice(0, 500), provider ?? '', JSON.stringify(topics), JSON.stringify(people), now]
  );

  // Update relationships
  for (const name of people) {
    const existing = await db.getFirstAsync<any>(
      'SELECT id, topics, interaction_count FROM relationships WHERE name = ?', [name]
    );
    if (existing) {
      const existingTopics: string[] = JSON.parse(existing.topics);
      const merged = [...new Set([...existingTopics, ...topics])].slice(0, 20);
      await db.runAsync(
        'UPDATE relationships SET interaction_count = ?, last_seen = ?, topics = ? WHERE id = ?',
        [existing.interaction_count + 1, now, JSON.stringify(merged), existing.id]
      );
    } else {
      await db.runAsync(
        'INSERT INTO relationships (name, interaction_count, last_seen, topics) VALUES (?,?,?,?)',
        [name, 1, now, JSON.stringify(topics)]
      );
    }
  }

  // Update skill events
  for (const topic of topics) {
    await db.runAsync(
      'INSERT INTO skill_events (topic, context, created_at) VALUES (?,?,?)',
      [topic, userMsg.slice(0, 100), now]
    );
  }

  // Update daily patterns
  const d = new Date(now);
  const hour = d.getHours();
  const dow = d.getDay();
  for (const topic of topics) {
    await db.runAsync(
      `INSERT INTO daily_patterns (hour, day_of_week, topic, count)
       VALUES (?,?,?,1)
       ON CONFLICT(hour, day_of_week, topic) DO UPDATE SET count = count + 1`,
      [hour, dow, topic]
    );
  }
}

// ─── Generate daily journal via AI ───────────────────────────────────────────
export async function generateDailyJournal(settings: Settings): Promise<string | null> {
  const db = await getDB();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Check if already generated today
  const existing = await db.getFirstAsync<any>(
    'SELECT content FROM journal_entries WHERE date = ?', [todayStr]
  );
  if (existing) return existing.content;

  // Get today's conversations
  const start = startOfDay(new Date()).getTime();
  const logs = await db.getAllAsync<any>(
    'SELECT user_msg, ai_msg, topics, people FROM conversation_log WHERE created_at > ? ORDER BY created_at ASC',
    [start]
  );

  if (logs.length === 0) return null;

  const summary = logs.map((l: any, i: number) =>
    `${i + 1}. You: "${l.user_msg.slice(0, 100)}" → AI: "${l.ai_msg.slice(0, 100)}"`
  ).join('\n');

  const allTopics = [...new Set(logs.flatMap((l: any) => JSON.parse(l.topics || '[]')))];
  const allPeople = [...new Set(logs.flatMap((l: any) => JSON.parse(l.people || '[]')))];

  const prompt = `Generate a thoughtful personal journal entry for today based on these conversations.
Write in first person, 3-4 sentences, reflective tone. Note patterns, insights, and what was accomplished.
Topics discussed: ${allTopics.join(', ') || 'general'}.
People mentioned: ${allPeople.join(', ') || 'none'}.

Conversations:
${summary.slice(0, 1500)}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const content = response.trim();

    await db.runAsync(
      'INSERT OR REPLACE INTO journal_entries (date, content, key_topics, people_mentioned, created_at) VALUES (?,?,?,?,?)',
      [todayStr, content, JSON.stringify(allTopics), JSON.stringify(allPeople), Date.now()]
    );

    return content;
  } catch {
    return null;
  }
}

// ─── Get all journal entries ─────────────────────────────────────────────────
export async function getJournalEntries(limit = 30): Promise<JournalEntry[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM journal_entries ORDER BY date DESC LIMIT ?', [limit]
  );
  return rows.map((r: any) => ({
    date: r.date,
    content: r.content,
    keyTopics: JSON.parse(r.key_topics ?? '[]'),
    peopleMentioned: JSON.parse(r.people_mentioned ?? '[]'),
    createdAt: r.created_at,
  }));
}

// ─── Relationships ────────────────────────────────────────────────────────────
export async function getRelationships(): Promise<Relationship[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM relationships ORDER BY interaction_count DESC LIMIT 50'
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    interactionCount: r.interaction_count,
    lastSeen: r.last_seen,
    topics: JSON.parse(r.topics ?? '[]'),
    notes: r.notes ?? '',
  }));
}

export async function getRelationshipInsight(name: string): Promise<string> {
  const db = await getDB();
  const rel = await db.getFirstAsync<any>(
    'SELECT * FROM relationships WHERE name LIKE ?', [`%${name}%`]
  );
  if (!rel) return '';
  const topics = JSON.parse(rel.topics ?? '[]').slice(0, 5).join(', ');
  const daysSince = Math.floor((Date.now() - rel.last_seen) / 86400000);
  return `${name}: ${rel.interaction_count} interactions. Topics: ${topics}. Last: ${daysSince === 0 ? 'today' : `${daysSince}d ago`}.`;
}

// ─── Skill tree ───────────────────────────────────────────────────────────────
export async function getSkillTree(): Promise<SkillNode[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT topic, COUNT(*) as count FROM skill_events GROUP BY topic ORDER BY count DESC LIMIT 30'
  );
  return rows.map((r: any) => ({
    topic: r.topic,
    count: r.count,
    level: r.count > 50 ? 'expert' : r.count > 20 ? 'advanced' : r.count > 8 ? 'intermediate' : 'beginner',
  }));
}

// ─── Behavioral prediction ────────────────────────────────────────────────────
export async function getBehavioralPrediction(): Promise<string | null> {
  const db = await getDB();
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();

  const rows = await db.getAllAsync<any>(
    `SELECT topic, count FROM daily_patterns
     WHERE hour BETWEEN ? AND ? AND day_of_week = ?
     ORDER BY count DESC LIMIT 3`,
    [Math.max(0, hour - 1), Math.min(23, hour + 1), dow]
  );

  if (rows.length === 0) return null;
  const topics = rows.map((r: any) => r.topic).join(', ');
  return `Based on your patterns, you usually focus on: ${topics} at this time.`;
}

// ─── Stats summary for UI ──────────────────────────────────────────────────────
export async function getChronicleStats(): Promise<{
  totalConversations: number;
  totalPeople: number;
  topTopics: SkillNode[];
  streak: number;
}> {
  const db = await getDB();
  const [convCount, peopleCount] = await Promise.all([
    db.getFirstAsync<any>('SELECT COUNT(*) as c FROM conversation_log'),
    db.getFirstAsync<any>('SELECT COUNT(*) as c FROM relationships'),
  ]);
  const topTopics = await getSkillTree();

  // Compute journal streak
  const entries = await db.getAllAsync<any>(
    'SELECT date FROM journal_entries ORDER BY date DESC LIMIT 30'
  );
  let streak = 0;
  let d = new Date();
  for (const entry of entries) {
    if (entry.date === format(d, 'yyyy-MM-dd')) {
      streak++;
      d = new Date(d.getTime() - 86400000);
    } else break;
  }

  return {
    totalConversations: convCount?.c ?? 0,
    totalPeople: peopleCount?.c ?? 0,
    topTopics: topTopics.slice(0, 5),
    streak,
  };
}
