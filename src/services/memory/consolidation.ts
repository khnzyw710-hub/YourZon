// Memory Consolidation — nightly AI-powered job that merges duplicate facts,
// removes stale memories, and compresses related facts into summaries.

import * as SQLite from 'expo-sqlite';
import type { Settings } from '@/store';
import { routeToAIStream } from '@/services/ai/router';
import { consumeStream } from '@/services/ai/streaming';

const CONSOLIDATION_KEY = 'zon_last_consolidation';
const CONSOLIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const MIN_FACTS_TO_CONSOLIDATE = 10;

// ─── Check if consolidation needed ───────────────────────────────────────────
export async function shouldConsolidate(): Promise<boolean> {
  try {
    const stored = await import('@react-native-async-storage/async-storage')
      .then((m) => m.default.getItem(CONSOLIDATION_KEY));
    if (!stored) return true;
    return Date.now() - parseInt(stored) > CONSOLIDATION_INTERVAL_MS;
  } catch {
    return false;
  }
}

// ─── Run full consolidation pass ──────────────────────────────────────────────
export async function runMemoryConsolidation(settings: Settings): Promise<{
  merged: number;
  deleted: number;
  compressed: number;
}> {
  const result = { merged: 0, deleted: 0, compressed: 0 };

  try {
    const db = await SQLite.openDatabaseAsync('zon_memory.db');

    // 1. Delete stale facts (not accessed in 30 days, low relevance)
    const staleTs = Date.now() - STALE_THRESHOLD_MS;
    const staleResult = await db.runAsync(
      `DELETE FROM facts WHERE created_at < ? AND key NOT IN (
         SELECT key FROM facts ORDER BY created_at DESC LIMIT 50
       )`,
      [staleTs]
    );
    result.deleted = staleResult.changes;

    // 2. Find near-duplicate facts (same key prefix, similar content)
    const allFacts = await db.getAllAsync<any>(
      'SELECT id, key, value, embedding FROM facts ORDER BY created_at ASC'
    );

    if (allFacts.length < MIN_FACTS_TO_CONSOLIDATE) {
      await markConsolidationDone();
      return result;
    }

    // Group by key prefix (first word)
    const groups = new Map<string, typeof allFacts>();
    for (const fact of allFacts) {
      const prefix = (fact.key as string).split('_')[0] ?? fact.key;
      const group = groups.get(prefix) ?? [];
      group.push(fact);
      groups.set(prefix, group);
    }

    // 3. For groups with many facts, ask AI to compress
    const hasAI = settings.apiKeys.anthropic || settings.apiKeys.openai || settings.apiKeys.gemini;
    if (hasAI) {
      for (const [prefix, facts] of groups.entries()) {
        if (facts.length < 4) continue;

        // Compress with AI
        const factsText = facts.map((f: any) => `• ${f.key}: ${f.value}`).join('\n');
        const prompt = `Compress and merge these memory facts into 1-3 concise summaries.
Remove duplicates. Keep only the most important/recent information.
Output as JSON array of {key, value} objects.\n\nFacts:\n${factsText}`;

        try {
          const { stream } = await routeToAIStream(prompt, [], settings, undefined);
          let compressed = '';
          await consumeStream(stream, () => {}, async () => {}, async (full) => {
            compressed = full;
          });

          // Parse and replace
          const jsonMatch = compressed.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const newFacts: Array<{ key: string; value: string }> = JSON.parse(jsonMatch[0]);

            // Delete old facts for this prefix
            for (const fact of facts) {
              await db.runAsync('DELETE FROM facts WHERE id = ?', [fact.id]);
            }

            // Insert compressed facts
            const now = Date.now();
            for (const nf of newFacts) {
              await db.runAsync(
                'INSERT OR REPLACE INTO facts (key, value, created_at) VALUES (?,?,?)',
                [nf.key, nf.value, now]
              );
            }

            result.compressed += facts.length - newFacts.length;
            result.merged += newFacts.length;
          }
        } catch {
          // Skip if AI fails for this group
        }
      }
    }

    // 4. Remove exact duplicate values
    await db.execAsync(`
      DELETE FROM facts WHERE id NOT IN (
        SELECT MIN(id) FROM facts GROUP BY key
      )
    `);

    await markConsolidationDone();
  } catch {}

  return result;
}

async function markConsolidationDone(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(CONSOLIDATION_KEY, Date.now().toString());
  } catch {}
}

// ─── Trigger nightly consolidation (call from app background / chronicle) ────
export async function triggerNightlyConsolidation(settings: Settings): Promise<void> {
  try {
    const needed = await shouldConsolidate();
    if (!needed) return;

    // Run in background, non-blocking
    runMemoryConsolidation(settings).catch(() => {});
  } catch {}
}
