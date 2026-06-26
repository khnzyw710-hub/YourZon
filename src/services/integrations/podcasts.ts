import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('zon_integrations.db');
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS podcast_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    rss_url TEXT NOT NULL UNIQUE,
    image_url TEXT,
    category TEXT,
    language TEXT DEFAULT 'he',
    last_checked INTEGER,
    created_at INTEGER NOT NULL
  )`);
  await _db.runAsync(`CREATE TABLE IF NOT EXISTS podcast_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    podcast_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    audio_url TEXT,
    duration_sec INTEGER,
    published_at TEXT,
    listened INTEGER DEFAULT 0,
    progress_sec INTEGER DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`);
  return _db;
}

export interface PodcastSubscription {
  id?: number;
  title: string;
  rssUrl: string;
  imageUrl?: string;
  category?: string;
  language: string;
  lastChecked?: number;
}

export interface PodcastEpisode {
  id?: number;
  podcastId: number;
  title: string;
  description?: string;
  audioUrl?: string;
  durationSec?: number;
  publishedAt?: string;
  listened: boolean;
  progressSec: number;
  notes?: string;
}

export async function subscribeToPodcast(sub: Omit<PodcastSubscription, 'id'>): Promise<number> {
  const db = await getDB();
  const result = await db.runAsync(
    `INSERT OR IGNORE INTO podcast_subscriptions (title, rss_url, image_url, category, language, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [sub.title, sub.rssUrl, sub.imageUrl ?? null, sub.category ?? null, sub.language, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function getSubscriptions(): Promise<PodcastSubscription[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM podcast_subscriptions ORDER BY title`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    rssUrl: r.rss_url,
    imageUrl: r.image_url ?? undefined,
    category: r.category ?? undefined,
    language: r.language,
    lastChecked: r.last_checked ?? undefined,
  }));
}

export async function fetchPodcastEpisodes(subscription: PodcastSubscription): Promise<Partial<PodcastEpisode>[]> {
  try {
    const res = await fetch(subscription.rssUrl);
    if (!res.ok) return [];
    const text = await res.text();

    const items = text.match(/<item>[\s\S]*?<\/item>/g) ?? [];

    return items.slice(0, 20).map((itemXml) => {
      const getTag = (tag: string) => {
        const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      };
      const audioUrl = itemXml.match(/enclosure[^>]+url="([^"]+)"/)?.[1] ?? '';
      const duration = getTag('itunes:duration');

      return {
        podcastId: subscription.id ?? 0,
        title: getTag('title'),
        description: getTag('description').slice(0, 500),
        audioUrl: audioUrl || undefined,
        durationSec: duration ? parseDuration(duration) : undefined,
        publishedAt: getTag('pubDate') ? new Date(getTag('pubDate')).toISOString() : undefined,
        listened: false,
        progressSec: 0,
      };
    });
  } catch {
    return [];
  }
}

function parseDuration(str: string): number {
  const parts = str.split(':').map(Number).reverse();
  return (parts[0] ?? 0) + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) * 3600;
}

export async function generateEpisodeNotes(episode: PodcastEpisode, settings: Settings): Promise<string> {
  const prompt = `Create structured notes for podcast episode: "${episode.title}"

Description: ${episode.description ?? 'Not available'}

Generate:
1. Key topics covered
2. Main insights (3-5 points)
3. Actionable takeaways
4. Questions for reflection

Format as markdown.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function findPodcastsByTopic(topic: string, language: 'he' | 'en', settings: Settings): Promise<Array<{
  title: string;
  description: string;
  rssUrl?: string;
}>> {
  const prompt = `Recommend 5 podcasts on topic: "${topic}" in language: ${language === 'he' ? 'Hebrew' : 'English'}

For each include: title, 1-sentence description, and if you know the RSS feed URL.

Respond with JSON array:
[{"title": "...", "description": "...", "rssUrl": "url or null"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}
