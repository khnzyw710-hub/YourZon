import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import type { Conversation } from '@/store';
import { AI_PROVIDERS } from '@/constants';

// ─── Plain text export ────────────────────────────────────────────────────────
export function conversationToText(conv: Conversation): string {
  const lines = [
    `=== ZON — ${conv.title} ===`,
    format(new Date(conv.createdAt), 'dd/MM/yyyy HH:mm'),
    '',
    ...conv.messages.map((m) => {
      const who = m.role === 'user' ? 'אתה' : `Zon (${m.provider ? AI_PROVIDERS[m.provider].name : 'AI'})`;
      const time = format(new Date(m.timestamp), 'HH:mm');
      return `[${time}] ${who}:\n${m.content}`;
    }),
  ];
  return lines.join('\n\n');
}

// ─── HTML for PDF ─────────────────────────────────────────────────────────────
function conversationToHTML(conv: Conversation): string {
  const bubbles = conv.messages
    .map((m) => {
      const isUser = m.role === 'user';
      const provider = m.provider ? AI_PROVIDERS[m.provider] : null;
      const color = provider?.color ?? '#6366f1';
      const align = isUser ? 'right' : 'left';
      const label = isUser ? 'אתה' : `Zon · ${provider?.name ?? 'AI'}`;
      return `
        <div style="margin:8px 0; text-align:${align}; direction:rtl;">
          <span style="font-size:10px; color:#888;">${label} · ${format(new Date(m.timestamp), 'HH:mm')}</span><br/>
          <span style="
            display:inline-block;
            background:${isUser ? '#1e1e1e' : '#141414'};
            border-left:3px solid ${color};
            padding:8px 12px;
            border-radius:8px;
            max-width:80%;
            color:#f5f5f5;
            font-size:14px;
            text-align:right;
          ">${m.content.replace(/\n/g, '<br/>')}</span>
        </div>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="utf-8"/>
      <style>
        body { background:#0a0a0a; color:#f5f5f5; font-family:sans-serif; padding:20px; }
        h1 { color:#6366f1; letter-spacing:4px; }
      </style>
    </head>
    <body>
      <h1>ZON</h1>
      <p style="color:#888;">${conv.title} · ${format(new Date(conv.createdAt), 'dd/MM/yyyy HH:mm')}</p>
      <hr style="border-color:#2a2a2a;"/>
      ${bubbles}
    </body>
    </html>`;
}

// ─── Share as PDF ─────────────────────────────────────────────────────────────
export async function shareConversationAsPDF(conv: Conversation): Promise<void> {
  const html = conversationToHTML(conv);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'שתף שיחה' });
}

// ─── Share as text (WhatsApp, etc.) ──────────────────────────────────────────
export async function shareConversationAsText(conv: Conversation): Promise<void> {
  const text = conversationToText(conv);
  await Sharing.shareAsync(
    `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
    { dialogTitle: 'שתף שיחה', mimeType: 'text/plain' }
  );
}
