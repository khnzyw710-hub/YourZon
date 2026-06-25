import { Message } from '@/store';

const SYSTEM = `You are Zon, an always-on AI life assistant running on a mobile device. You listen continuously and help with anything. Be concise and natural — responses are read aloud via TTS. Use short sentences. Avoid markdown formatting.`;

// ─── Non-streaming (single response) ─────────────────────────────────────────
export async function askClaude(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string
): Promise<string> {
  let collected = '';
  for await (const chunk of streamClaude(messages, query, apiKey, imageBase64, contextMemory)) {
    collected += chunk;
  }
  return collected;
}

// ─── Streaming ────────────────────────────────────────────────────────────────
export async function* streamClaude(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string,
  contextMemory?: string
): AsyncGenerator<string> {
  const systemPrompt = contextMemory
    ? `${SYSTEM}\n\nRelevant memory about this user:\n${contextMemory}`
    : SYSTEM;

  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  const userContent: any[] = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: query },
      ]
    : [{ type: 'text', text: query }];

  history.push({ role: 'user', content: userContent as any });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: history,
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}`);

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
        const json = JSON.parse(data);
        const delta = json.delta?.text ?? json.delta?.value ?? '';
        if (delta) yield delta;
      } catch {}
    }
  }
}
