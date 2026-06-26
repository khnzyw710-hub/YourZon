import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── News & content aggregation ────────────────────────────────────────────────
// All news fetched from public RSS / free APIs — no paid news service keys

export type NewsCategory = 'general' | 'technology' | 'business' | 'health' | 'science' | 'sports' | 'entertainment' | 'israel';
export type NewsLanguage = 'he' | 'en';

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  category: NewsCategory;
  language: NewsLanguage;
  imageUrl?: string;
}

// ─── Free news sources (RSS) ──────────────────────────────────────────────────

const RSS_SOURCES: Array<{ url: string; source: string; language: NewsLanguage; category: NewsCategory }> = [
  { url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', source: 'Ynet', language: 'he', category: 'general' },
  { url: 'https://rss.walla.co.il/feed/1', source: 'Walla', language: 'he', category: 'general' },
  { url: 'https://www.maariv.co.il/rss/rssFeedTop', source: 'Maariv', language: 'he', category: 'general' },
  { url: 'https://feeds.bbci.co.uk/news/rss.xml', source: 'BBC', language: 'en', category: 'general' },
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', language: 'en', category: 'technology' },
  { url: 'https://news.ycombinator.com/rss', source: 'Hacker News', language: 'en', category: 'technology' },
];

function parseRSSItem(item: Element): Partial<NewsArticle> {
  const getText = (tag: string) => item.querySelector(tag)?.textContent?.trim() ?? '';
  const getAttr = (tag: string, attr: string) => item.querySelector(tag)?.getAttribute(attr) ?? undefined;

  return {
    title: getText('title'),
    description: getText('description').replace(/<[^>]*>/g, '').slice(0, 300),
    url: getText('link') || getText('guid'),
    publishedAt: getText('pubDate') ? new Date(getText('pubDate')).toISOString() : new Date().toISOString(),
    imageUrl: getAttr('media\\:thumbnail, enclosure', 'url'),
  };
}

export async function fetchRSSFeed(url: string): Promise<Array<Partial<NewsArticle>>> {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) return [];
    const text = await res.text();

    const parser = new (require('react-native').DOMParser ?? global.DOMParser)();
    const doc = parser.parseFromString(text, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.map(parseRSSItem).slice(0, 20);
  } catch {
    return [];
  }
}

export async function fetchHeadlines(
  category: NewsCategory = 'general',
  language: NewsLanguage = 'he',
  limit = 10
): Promise<NewsArticle[]> {
  const sources = RSS_SOURCES.filter(
    (s) => s.language === language && (s.category === category || s.category === 'general')
  );

  const allArticles: NewsArticle[] = [];

  await Promise.allSettled(
    sources.map(async (src) => {
      const items = await fetchRSSFeed(src.url);
      for (const item of items) {
        if (item.title && item.url) {
          allArticles.push({
            title: item.title,
            description: item.description ?? '',
            url: item.url,
            source: src.source,
            publishedAt: item.publishedAt ?? new Date().toISOString(),
            category: src.category,
            language: src.language,
            imageUrl: item.imageUrl,
          });
        }
      }
    })
  );

  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return allArticles.slice(0, limit);
}

// ─── AI-powered news features ─────────────────────────────────────────────────

export async function summarizeArticle(article: NewsArticle, settings: Settings): Promise<string> {
  const prompt = `Summarize this news article in 3 bullet points:
Title: ${article.title}
${article.description}

Focus on: what happened, who is involved, why it matters. Be concise.`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function getDailyBriefing(settings: Settings): Promise<string> {
  const [hebrewNews, techNews] = await Promise.all([
    fetchHeadlines('general', 'he', 5),
    fetchHeadlines('technology', 'en', 3),
  ]);

  const headlines = [
    ...hebrewNews.map((a) => `• ${a.title} (${a.source})`),
    ...techNews.map((a) => `• ${a.title} (${a.source})`),
  ].join('\n');

  const prompt = `Create a morning news briefing based on these headlines:
${headlines}

Format as a spoken briefing (like a news anchor). Hebrew and English mix is fine.
Keep it under 150 words. Start with "בוקר טוב" or "Good morning".`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

export async function detectNewsTrends(articles: NewsArticle[], settings: Settings): Promise<Array<{
  topic: string;
  frequency: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}>> {
  if (articles.length === 0) return [];

  const titles = articles.map((a) => a.title).join('\n');
  const prompt = `Identify trending topics in these news headlines:
${titles}

Respond with JSON array (top 5 topics):
[{"topic": "topic name", "frequency": count, "sentiment": "positive|negative|neutral"}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}

export async function findRelatedArticles(
  articleTitle: string,
  allArticles: NewsArticle[],
  settings: Settings
): Promise<NewsArticle[]> {
  if (allArticles.length < 2) return [];

  const prompt = `Which of these articles are most related to: "${articleTitle}"?
${allArticles.map((a, i) => `${i}: ${a.title}`).join('\n')}

Respond with JSON array of index numbers: [0, 3, 5]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      const indices = JSON.parse(match[0]) as number[];
      return indices.filter((i) => i >= 0 && i < allArticles.length).map((i) => allArticles[i]);
    }
  } catch {}

  return [];
}

export async function generateNewsQuiz(article: NewsArticle, settings: Settings): Promise<Array<{
  question: string;
  answer: string;
}>> {
  const prompt = `Create 3 quiz questions from this news article:
Title: ${article.title}
${article.description}

Respond with JSON array:
[{"question": "...", "answer": "..."}]`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return [];
}
