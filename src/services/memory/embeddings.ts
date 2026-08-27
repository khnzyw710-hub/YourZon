// Semantic similarity engine — OpenAI embeddings (primary) / Gemini (fallback) / BM25 (offline)

// ─── Math ─────────────────────────────────────────────────────────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ─── OpenAI text-embedding-3-small (512 dims for storage efficiency) ─────────
export async function generateEmbeddingOpenAI(
  text: string,
  apiKey: string
): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 2000), dimensions: 512 }),
  });
  if (!res.ok) throw new Error(`OAI embed ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
}

// ─── Gemini text-embedding-004 (768 dims) ─────────────────────────────────────
export async function generateEmbeddingGemini(
  text: string,
  apiKey: string
): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } }),
    }
  );
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  const data = await res.json();
  return data.embedding.values as number[];
}

// ─── Unified embedding generator with fallback chain ─────────────────────────
export async function generateEmbedding(
  text: string,
  apiKeys: { openai: string; gemini: string }
): Promise<number[] | null> {
  if (apiKeys.openai) {
    try { return await generateEmbeddingOpenAI(text, apiKeys.openai); } catch {}
  }
  if (apiKeys.gemini) {
    try { return await generateEmbeddingGemini(text, apiKeys.gemini); } catch {}
  }
  return null; // falls back to BM25
}

// ─── BM25 scoring (offline fallback — no API key needed) ─────────────────────
export function bm25Score(
  query: string,
  document: string,
  avgDocLen = 50,
  k1 = 1.5,
  b = 0.75
): number {
  const qTokens = tokenize(query);
  const dTokens = tokenize(document);
  const dLen = dTokens.length;

  return qTokens.reduce((score, term) => {
    const tf = dTokens.filter((t) => t === term).length;
    if (tf === 0) return score;
    const idf = Math.log(1 + (1000 - 1 + 0.5) / (1 + 0.5)); // simplified IDF
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dLen / avgDocLen)));
    return score + idf * tfNorm;
  }, 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s֐-׿]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// ─── SQLite helpers ───────────────────────────────────────────────────────────
export function serializeEmbedding(v: number[]): string {
  return v.join(',');
}

export function deserializeEmbedding(s: string | null): number[] | null {
  if (!s || !s.length) return null;
  return s.split(',').map(Number);
}
