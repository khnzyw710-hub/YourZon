import { Message } from '@/store';

const SYSTEM = `You are Zon, an always-on AI life assistant. Be concise and natural — responses are read aloud. Short sentences, no markdown.`;

export async function askOpenAI(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string,
  systemPrompt?: string
): Promise<string> {
  let collected = '';
  for await (const chunk of streamOpenAI(messages, query, apiKey, imageBase64, contextMemory, systemPrompt)) {
    collected += chunk;
  }
  return collected;
}

export async function* streamOpenAI(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string,
  systemPrompt?: string
): AsyncGenerator<string> {
  const baseSystem = systemPrompt ?? SYSTEM;
  const system = contextMemory ? `${baseSystem}\n\nUser memory:\n${contextMemory}` : baseSystem;

  const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  const userMsg = imageBase64
    ? {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' } },
          { type: 'text', text: query },
        ],
      }
    : { role: 'user', content: query };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'system', content: system }, ...history, userMsg],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);

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
