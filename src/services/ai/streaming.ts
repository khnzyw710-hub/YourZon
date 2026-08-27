// ─── Sentence splitter for TTS pipeline ───────────────────────────────────────
// Splits a buffer into complete sentences ready to speak, keeping the remainder.

const SENTENCE_END = /[.!?。！？\n]/;

export function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let remaining = buffer;

  while (true) {
    const match = SENTENCE_END.exec(remaining);
    if (!match) break;

    const sentence = remaining.slice(0, match.index + 1).trim();
    remaining = remaining.slice(match.index + 1);

    if (sentence.length > 2) sentences.push(sentence);
  }

  return { sentences, remainder: remaining };
}

// ─── Streaming orchestrator ────────────────────────────────────────────────────
// Drives an AsyncGenerator of text chunks, extracts sentences as they come,
// and calls onSentence immediately (for TTS) + onChunk for live UI display.
export async function consumeStream(
  generator: AsyncGenerator<string>,
  onChunk: (text: string) => void,
  onSentence: (sentence: string) => Promise<void>,
  onDone: (fullText: string) => void | Promise<void>
): Promise<void> {
  let buffer = '';
  let full = '';

  for await (const chunk of generator) {
    buffer += chunk;
    full += chunk;
    onChunk(full);

    const { sentences, remainder } = extractSentences(buffer);
    buffer = remainder;

    for (const s of sentences) {
      await onSentence(s);
    }
  }

  // Flush remaining buffer
  if (buffer.trim().length > 0) {
    await onSentence(buffer.trim());
  }

  await onDone(full);
}
