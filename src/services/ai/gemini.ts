import { Message } from '@/store';

export async function askGemini(
  messages: Message[],
  query: string,
  apiKey: string,
  imageBase64?: string
): Promise<string> {
  const history = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const userParts: any[] = imageBase64
    ? [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: query },
      ]
    : [{ text: query }];

  const systemInstruction = {
    parts: [
      {
        text: 'You are Zon, an always-on AI life assistant. Be concise and natural — your responses will be read aloud.',
      },
    ],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemInstruction,
        contents: [...history, { role: 'user', parts: userParts }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
