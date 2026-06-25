import { Message } from '@/store';

export async function askClaude(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string
): Promise<string> {
  const systemPrompt = `You are Zon, an always-on AI life assistant. You listen continuously and help with anything — analysis, coding, explanations, planning. Be concise and direct. Speak naturally as your responses will be read aloud.`;

  const formattedMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const userContent: any[] = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: query },
      ]
    : [{ type: 'text', text: query }];

  formattedMessages.push({ role: 'user', content: userContent as any });

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
      messages: formattedMessages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}
