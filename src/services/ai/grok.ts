import { Message } from '@/store';

const SYSTEM = `You are Zon, an always-on AI life assistant. Be concise, direct, and sharp — responses are read aloud. Short sentences, no markdown.`;

export async function askGrok(
  messages: Message[],
  query: string,
  apiKey: string,
  contextMemory?: string
): Promise<string> {
  let collected = '';
  for await (const chunk of streamGrok(messages, query, apiKey, contextMemory)) {
    collected += chunk;
  }
  return collected;
}

export async function* streamGrok(
  messages: Message[],
  query: string,
  apiKey: string,
  contextMemory?: string
): AsyncGenerator<string> {
  const system = contextMemory ? `${SYSTEM}\n\nUser memory:\n${contextMemory}` : SYSTEM;
  const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: query }],
    }),
  });

  if (!res.ok) throw new Error(`Grok ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch {}
    }
  }
}
