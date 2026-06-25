import { Message } from '@/store';

export async function askOpenAI(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string
): Promise<string> {
  const systemMsg = {
    role: 'system',
    content:
      'You are Zon, an always-on AI life assistant. Be concise and natural — responses will be read aloud.',
  };

  const history = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const userMsg = imageBase64
    ? {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: query },
        ],
      }
    : { role: 'user', content: query };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [systemMsg, ...history, userMsg],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
