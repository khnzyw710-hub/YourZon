import { Message } from '@/store';

const SYSTEM_TEXT = `You are Zon, an always-on AI life assistant. Be concise and natural — responses are read aloud. Short sentences, no markdown.`;

export async function askGemini(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string
): Promise<string> {
  let collected = '';
  for await (const chunk of streamGemini(messages, query, apiKey, imageBase64, contextMemory)) {
    collected += chunk;
  }
  return collected;
}

export async function* streamGemini(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string
): AsyncGenerator<string> {
  const systemText = contextMemory
    ? `${SYSTEM_TEXT}\n\nUser memory:\n${contextMemory}`
    : SYSTEM_TEXT;

  const history = messages.slice(-20).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const userParts: any[] = imageBase64
    ? [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, { text: query }]
    : [{ text: query }];

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [...history, { role: 'user', parts: userParts }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const delta =
          JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (delta) yield delta;
      } catch {}
    }
  }
}

// Quick single-shot for scene description (used by vision layer)
export async function quickDescribeImage(imageBase64: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: 'Briefly describe this scene in one sentence for a blind assistant. Be specific about objects, people, text visible.' },
          ],
        }],
        generationConfig: { maxOutputTokens: 120 },
      }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
