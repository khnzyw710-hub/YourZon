import { Message } from '@/store';

export async function askGrok(
  messages: Message[],
  query: string,
  apiKey: string
): Promise<string> {
  const systemMsg = {
    role: 'system',
    content:
      'You are Zon, an always-on AI assistant. Be concise, direct, and a little witty — responses are read aloud.',
  };

  const history = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3',
      max_tokens: 1024,
      messages: [systemMsg, ...history, { role: 'user', content: query }],
    }),
  });

  if (!res.ok) throw new Error(`Grok API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
