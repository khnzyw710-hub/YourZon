import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';

// ─── Messaging platform deep links & utilities ────────────────────────────────
// All platform integrations use deep links (no server-side integration needed)
// Voice commands → generate content → user sends manually or via share sheet

export type MessagingPlatform = 'whatsapp' | 'telegram' | 'signal' | 'sms' | 'email';

// ─── Deep link builders ───────────────────────────────────────────────────────
export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[^+\d]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

export function buildTelegramLink(username: string, message?: string): string {
  if (message) return `https://t.me/${username}?text=${encodeURIComponent(message)}`;
  return `https://t.me/${username}`;
}

export function buildSMSLink(phone: string, message: string): string {
  const cleaned = phone.replace(/[^+\d]/g, '');
  const encoded = encodeURIComponent(message);
  return `sms:${cleaned}?body=${encoded}`;
}

export function buildEmailLink(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── AI message composition for platforms ────────────────────────────────────
export async function composeMessageForPlatform(
  platform: MessagingPlatform,
  intent: string,
  recipient: string,
  context: string,
  settings: Settings
): Promise<string> {
  const platformGuidance: Record<MessagingPlatform, string> = {
    whatsapp: 'Conversational, warm, uses emoji naturally, supports markdown *bold*, _italic_',
    telegram: 'Can be longer, supports markdown, more formal than WhatsApp',
    signal: 'Privacy-focused, concise, no tracking, treat like SMS',
    sms: 'Very short (under 160 chars), plain text, no emoji overuse',
    email: 'Full email format with subject and proper greeting',
  };

  const prompt = `Write a ${platform} message:
Platform style: ${platformGuidance[platform]}
Purpose: ${intent}
To: ${recipient}
Context: ${context}

Write only the message content (for email include Subject: first).`;

  const { response } = await routeToAI(prompt, [], settings);
  return response;
}

// ─── Smart contact lookup ─────────────────────────────────────────────────────
export async function parseRecipientFromText(text: string, settings: Settings): Promise<{
  name: string;
  platform?: MessagingPlatform;
  handle?: string;
}> {
  const prompt = `Extract recipient info from: "${text}"
Respond with JSON: {"name": "...", "platform": "whatsapp|telegram|signal|sms|email or null", "handle": "phone/username/email or null"}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    const match = response.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { name: text };
}

// ─── Voice-to-message pipeline ────────────────────────────────────────────────
export interface VoiceMessageResult {
  recipient: string;
  platform: MessagingPlatform;
  message: string;
  deepLink?: string;
  requiresUserAction: boolean;
}

export async function processVoiceSendCommand(
  transcript: string,
  contacts: Array<{ name: string; phone?: string; email?: string }>,
  settings: Settings
): Promise<VoiceMessageResult | null> {
  const prompt = `Parse send command: "${transcript}"
Available contacts: ${contacts.map((c) => c.name).join(', ')}

Respond with JSON or null:
{
  "recipientName": "contact name",
  "platform": "whatsapp|sms|email",
  "messageContent": "the actual message to send"
}`;

  try {
    const { response } = await routeToAI(prompt, [], settings);
    if (response.trim().toLowerCase() === 'null') return null;
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const contact = contacts.find((c) => c.name.toLowerCase().includes(parsed.recipientName?.toLowerCase()));
    if (!contact) return null;

    let deepLink: string | undefined;
    const platform = parsed.platform as MessagingPlatform;

    if (platform === 'whatsapp' && contact.phone) {
      deepLink = buildWhatsAppLink(contact.phone, parsed.messageContent);
    } else if (platform === 'sms' && contact.phone) {
      deepLink = buildSMSLink(contact.phone, parsed.messageContent);
    } else if (platform === 'email' && contact.email) {
      deepLink = buildEmailLink(contact.email, 'From ZON', parsed.messageContent);
    }

    return {
      recipient: contact.name,
      platform,
      message: parsed.messageContent,
      deepLink,
      requiresUserAction: true, // Always require user to confirm before sending
    };
  } catch {
    return null;
  }
}

// ─── Message scheduling ───────────────────────────────────────────────────────
export interface ScheduledMessage {
  id: string;
  recipient: string;
  platform: MessagingPlatform;
  message: string;
  scheduledAt: number;
  deepLink?: string;
  sent: boolean;
}

const _scheduledMessages: ScheduledMessage[] = [];

export function scheduleMessage(params: Omit<ScheduledMessage, 'id' | 'sent'>): string {
  const id = Date.now().toString(36);
  _scheduledMessages.push({ ...params, id, sent: false });
  return id;
}

export function getDueMessages(): ScheduledMessage[] {
  const now = Date.now();
  return _scheduledMessages.filter((m) => !m.sent && m.scheduledAt <= now);
}

export function markMessageSent(id: string): void {
  const msg = _scheduledMessages.find((m) => m.id === id);
  if (msg) msg.sent = true;
}
