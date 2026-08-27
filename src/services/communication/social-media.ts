import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_communication.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    content TEXT NOT NULL,
    hashtags TEXT,
    status TEXT DEFAULT 'draft',
    scheduled_at INTEGER,
    published_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type SocialPlatform = 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'tiktok' | 'threads';

export interface SocialPost {
  id?: number;
  platform: SocialPlatform;
  content: string;
  hashtags?: string[];
  status: 'draft' | 'scheduled' | 'published';
  scheduledAt?: number;
  publishedAt?: number;
  createdAt: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function saveSocialPost(post: Omit<SocialPost, 'id' | 'createdAt'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT INTO social_posts (platform, content, hashtags, status, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [post.platform, post.content, post.hashtags ? JSON.stringify(post.hashtags) : null, post.status, post.scheduledAt ?? null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getSocialPosts(platform?: SocialPlatform, status?: string): Promise<SocialPost[]> {
  const db = await getDB();
  let query = `SELECT * FROM social_posts WHERE 1=1`;
  const params: any[] = [];
  if (platform) { query += ` AND platform = ?`; params.push(platform); }
  if (status) { query += ` AND status = ?`; params.push(status); }
  query += ` ORDER BY created_at DESC LIMIT 50`;

  const rows = await db.getAllAsync<Record<string, any>>(query, params);
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform as SocialPlatform,
    content: r.content,
    hashtags: r.hashtags ? JSON.parse(r.hashtags) : undefined,
    status: r.status,
    scheduledAt: r.scheduled_at ?? undefined,
    publishedAt: r.published_at ?? undefined,
    createdAt: r.created_at,
  }));
}

// ─── AI social media content generation ──────────────────────────────────────
const PLATFORM_CONSTRAINTS: Record<SocialPlatform, { maxChars: number; style: string }> = {
  instagram: { maxChars: 2200, style: 'Visual storytelling, use emoji, personal and engaging, end with a question or CTA' },
  twitter: { maxChars: 280, style: 'Concise, punchy, one clear idea, hook in first 5 words' },
  linkedin: { maxChars: 3000, style: 'Professional, insight-driven, tell a story, add value, no hashtag spam' },
  facebook: { maxChars: 63206, style: 'Conversational, community-focused, questions to drive comments' },
  tiktok: { maxChars: 2200, style: 'Hook first 3 seconds, energetic, trend-aware, call to action' },
  threads: { maxChars: 500, style: 'Casual and authentic, like a thought or observation' },
};

export async function generateSocialPost(params: {
  platform: SocialPlatform;
  topic: string;
  tone?: string;
  includeHashtags?: boolean;
  language?: 'he' | 'en';
  settings: Settings;
}): Promise<{ content: string; hashtags: string[] }> {
  const constraints = PLATFORM_CONSTRAINTS[params.platform];
  const langInstruction = params.language === 'he' ? 'Write in Hebrew (RTL).' : 'Write in English.';

  const prompt = `Write a ${params.platform} post about: "${params.topic}"
${langInstruction}
Style: ${constraints.style}
Max characters: ${constraints.maxChars}
Tone: ${params.tone ?? 'authentic and engaging'}
${params.includeHashtags ? 'Include 3-7 relevant hashtags at the end.' : 'No hashtags.'}

Write only the post content. No explanation.`;

  const { response } = await routeToAI(prompt, [], params.settings);

  // Extract hashtags
  const hashtagMatches = response.match(/#[\w֐-׿]+/g) ?? [];
  const hashtags = hashtagMatches.map((h) => h.slice(1));
  const content = response.replace(/#[\w֐-׿]+/g, '').trim();

  return { content: content || response, hashtags };
}

export async function generatePostSeries(
  topic: string,
  platform: SocialPlatform,
  count: number,
  settings: Settings
): Promise<string[]> {
  const prompt = `Create ${count} varied ${platform} posts about: "${topic}"

Each post should have a different angle/format:
1. Story/personal experience
2. Educational/tips
3. Question/engagement
4. Behind the scenes
5. Quote/inspiration

Separate each post with "---". Write only the posts.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('---')
    .map((p) => p.trim())
    .filter((p) => p.length > 10)
    .slice(0, count);
}

export async function optimizeHashtags(topic: string, platform: SocialPlatform, settings: Settings): Promise<string[]> {
  const prompt = `Generate ${platform === 'instagram' ? '15-20' : '3-5'} effective hashtags for a ${platform} post about: "${topic}"

Mix of: popular (high reach), niche (targeted), and branded/community hashtags.
List only the hashtags, one per line, without the # symbol.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response
    .split('\n')
    .map((h) => h.replace(/^#/, '').trim())
    .filter((h) => h.length > 0 && !h.includes(' '))
    .slice(0, 20);
}

export async function analyzeBestPostingTime(platform: SocialPlatform, audience: string, settings: Settings): Promise<string> {
  const prompt = `What are the best times to post on ${platform} for this audience: "${audience}"?
Provide specific times and days with brief reasoning. Keep it concise (3-4 bullet points).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function repurposeContent(content: string, fromPlatform: SocialPlatform, toPlatform: SocialPlatform, settings: Settings): Promise<string> {
  const toConstraints = PLATFORM_CONSTRAINTS[toPlatform];
  const prompt = `Repurpose this ${fromPlatform} content for ${toPlatform}:

Original: "${content}"

Adapt for ${toPlatform} style: ${toConstraints.style}
Max ${toConstraints.maxChars} characters.

Write only the repurposed content.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}
