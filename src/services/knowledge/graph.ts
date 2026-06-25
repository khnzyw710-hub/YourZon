// Knowledge Graph — extracts entities and relationships from every conversation,
// builds a queryable graph in SQLite. Answers "what do I know about X?"

import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_knowledge.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      aliases TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      mention_count INTEGER DEFAULT 1,
      last_seen INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(name, type)
    );
    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity TEXT NOT NULL,
      relation TEXT NOT NULL,
      to_entity TEXT NOT NULL,
      context TEXT DEFAULT '',
      confidence REAL DEFAULT 0.7,
      created_at INTEGER NOT NULL,
      UNIQUE(from_entity, relation, to_entity) ON CONFLICT REPLACE
    );
    CREATE TABLE IF NOT EXISTS entity_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_name TEXT NOT NULL,
      conversation_snippet TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);
  `);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type EntityType = 'person' | 'place' | 'project' | 'task' | 'organization' | 'concept' | 'date';

export interface Entity {
  id: number;
  name: string;
  type: EntityType;
  aliases: string[];
  summary: string;
  mentionCount: number;
  lastSeen: number;
  createdAt: number;
}

export interface Relation {
  fromEntity: string;
  relation: string;
  toEntity: string;
  context: string;
  confidence: number;
}

export interface KnowledgeResult {
  entity: Entity;
  relations: Relation[];
  recentMentions: string[];
}

// ─── Entity extraction patterns ───────────────────────────────────────────────
const PERSON_PATTERNS = [
  /(?:של|עם|ל|מ|אצל)\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/g,
  /(?:הבוס|החבר|האח|האחות|האמא|האבא|הבן|הבת)\s+(?:שלי\s+)?([א-ת]{2,})/g,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, // English proper names
];

const PROJECT_PATTERNS = [
  /פרויקט\s+([^\s,\.]+(?:\s+[^\s,\.]+)?)/gi,
  /המיזם\s+([^\s,\.]+)/gi,
  /project\s+([^\s,\.]+)/gi,
];

const TASK_PATTERNS = [
  /(?:צריך|חייב|אני\s+(?:אמור|עומד))\s+ל(.{3,40}?)(?:\.|$|,)/gi,
  /(?:need to|have to|must)\s+(.{3,40}?)(?:\.|$|,)/gi,
  /(?:להכין|לשלוח|לסיים|לעשות|לבדוק|לכתוב)\s+(.{3,40}?)(?:\.|$|,)/gi,
];

const PLACE_PATTERNS = [
  /(?:ב|ל|מ|אל)\s+(תל\s+אביב|ירושלים|חיפה|באר\s+שבע|הרצליה|רמת\s+גן|פתח\s+תקווה|ראשון\s+לציון)/gi,
  /(?:at|in|to|from)\s+([A-Z][a-zA-Z\s]{2,20}(?:Office|Center|Square|Street|Ave|Rd))/g,
];

function extractEntities(text: string): Array<{ name: string; type: EntityType }> {
  const found: Array<{ name: string; type: EntityType }> = [];
  const seen = new Set<string>();

  const add = (name: string, type: EntityType) => {
    const key = `${type}:${name.toLowerCase()}`;
    if (!seen.has(key) && name.length > 1 && name.length < 50) {
      seen.add(key);
      found.push({ name: name.trim(), type });
    }
  };

  // People
  for (const pattern of PERSON_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1] && !isCommonWord(m[1])) add(m[1], 'person');
    }
  }

  // Projects
  for (const pattern of PROJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1]) add(m[1], 'project');
    }
  }

  // Tasks
  for (const pattern of TASK_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1] && m[1].length > 3) add(m[1].trim(), 'task');
    }
  }

  // Places
  for (const pattern of PLACE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[1]) add(m[1], 'place');
    }
  }

  return found;
}

const COMMON_WORDS = new Set([
  'אני', 'אתה', 'הוא', 'היא', 'אנחנו', 'אתם', 'הם', 'של', 'עם', 'על', 'כן', 'לא',
  'the', 'and', 'but', 'for', 'you', 'are', 'was', 'not', 'have', 'this', 'that',
]);

function isCommonWord(w: string): boolean {
  return COMMON_WORDS.has(w.toLowerCase()) || /^\d+$/.test(w);
}

// ─── Extract relations between entities ───────────────────────────────────────
function extractRelations(
  text: string,
  entities: Array<{ name: string; type: EntityType }>
): Array<{ from: string; relation: string; to: string; context: string }> {
  const rels: Array<{ from: string; relation: string; to: string; context: string }> = [];
  const names = entities.map((e) => e.name);

  // Simple co-occurrence in same sentence = weak relation
  const sentences = text.split(/[.!?]/);
  for (const sentence of sentences) {
    const mentioned = names.filter((n) => sentence.toLowerCase().includes(n.toLowerCase()));
    if (mentioned.length >= 2) {
      // Detect relation keywords
      const rel = detectRelationKeyword(sentence);
      for (let i = 0; i < mentioned.length - 1; i++) {
        rels.push({
          from: mentioned[i]!,
          relation: rel,
          to: mentioned[i + 1]!,
          context: sentence.trim().slice(0, 120),
        });
      }
    }
  }

  return rels;
}

function detectRelationKeyword(sentence: string): string {
  const lower = sentence.toLowerCase();
  if (/עובד|עובדת|עובדים/.test(lower)) return 'עובד ב';
  if (/מנהל|מנהלת/.test(lower)) return 'מנהל';
  if (/חבר|חברה|חברים/.test(lower)) return 'חבר של';
  if (/אחראי|אחראית/.test(lower)) return 'אחראי על';
  if (/קשור|קשורה|קשורים/.test(lower)) return 'קשור ל';
  if (/works|working|work/.test(lower)) return 'works at';
  if (/manages|managed/.test(lower)) return 'manages';
  if (/owns|owned/.test(lower)) return 'owns';
  return 'mentioned with';
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function learnFromText(userText: string, aiText: string): Promise<void> {
  try {
    const combined = `${userText} ${aiText}`;
    const entities = extractEntities(combined);
    if (entities.length === 0) return;

    const relations = extractRelations(combined, entities);
    const db = await getDB();
    const now = Date.now();

    for (const { name, type } of entities) {
      await db.runAsync(
        `INSERT INTO entities (name, type, mention_count, last_seen, created_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(name, type) DO UPDATE SET
           mention_count = mention_count + 1,
           last_seen = excluded.last_seen`,
        [name, type, now, now]
      );
      // Store snippet
      const snippet = userText.slice(0, 150);
      await db.runAsync(
        'INSERT INTO entity_mentions (entity_name, conversation_snippet, created_at) VALUES (?,?,?)',
        [name, snippet, now]
      );
    }

    for (const rel of relations) {
      await db.runAsync(
        `INSERT INTO relations (from_entity, relation, to_entity, context, confidence, created_at)
         VALUES (?,?,?,?,?,?)`,
        [rel.from, rel.relation, rel.to, rel.context, 0.7, now]
      );
    }
  } catch {}
}

export async function queryEntity(name: string): Promise<KnowledgeResult | null> {
  try {
    const db = await getDB();
    const entity = await db.getFirstAsync<any>(
      `SELECT * FROM entities WHERE name LIKE ? ORDER BY mention_count DESC LIMIT 1`,
      [`%${name}%`]
    );
    if (!entity) return null;

    const relations = await db.getAllAsync<any>(
      `SELECT * FROM relations WHERE from_entity LIKE ? OR to_entity LIKE ? LIMIT 20`,
      [`%${name}%`, `%${name}%`]
    );
    const mentions = await db.getAllAsync<any>(
      `SELECT conversation_snippet FROM entity_mentions WHERE entity_name LIKE ? ORDER BY created_at DESC LIMIT 5`,
      [`%${name}%`]
    );

    return {
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type as EntityType,
        aliases: JSON.parse(entity.aliases ?? '[]'),
        summary: entity.summary ?? '',
        mentionCount: entity.mention_count,
        lastSeen: entity.last_seen,
        createdAt: entity.created_at,
      },
      relations: relations.map((r: any) => ({
        fromEntity: r.from_entity,
        relation: r.relation,
        toEntity: r.to_entity,
        context: r.context,
        confidence: r.confidence,
      })),
      recentMentions: mentions.map((m: any) => m.conversation_snippet),
    };
  } catch {
    return null;
  }
}

export async function getTopEntities(limit = 20): Promise<Entity[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM entities ORDER BY mention_count DESC LIMIT ?`,
      [limit]
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type as EntityType,
      aliases: JSON.parse(r.aliases ?? '[]'),
      summary: r.summary ?? '',
      mentionCount: r.mention_count,
      lastSeen: r.last_seen,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getEntityRelations(entityName: string): Promise<Relation[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM relations WHERE from_entity LIKE ? OR to_entity LIKE ? ORDER BY confidence DESC LIMIT 30`,
      [`%${entityName}%`, `%${entityName}%`]
    );
    return rows.map((r: any) => ({
      fromEntity: r.from_entity,
      relation: r.relation,
      toEntity: r.to_entity,
      context: r.context,
      confidence: r.confidence,
    }));
  } catch {
    return [];
  }
}

export async function updateEntitySummary(name: string, summary: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync('UPDATE entities SET summary = ? WHERE name = ?', [summary, name]);
  } catch {}
}

export async function deleteEntity(name: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync('DELETE FROM entities WHERE name = ?', [name]);
    await db.runAsync('DELETE FROM relations WHERE from_entity = ? OR to_entity = ?', [name, name]);
    await db.runAsync('DELETE FROM entity_mentions WHERE entity_name = ?', [name]);
  } catch {}
}
