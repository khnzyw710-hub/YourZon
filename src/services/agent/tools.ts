import { createCalendarEvent } from '@/services/integrations/calendar';
import { sendSMSToContact } from '@/services/integrations/sms';
import { getClipboardText, setClipboardText } from '@/services/integrations/clipboard';
import { findContactByName } from '@/services/integrations/contacts';
import { getCurrentLocation } from '@/services/integrations/location';
import { saveFact } from '@/services/memory';

// ─── Tool definitions ─────────────────────────────────────────────────────────
export type ToolName =
  | 'create_calendar_event'
  | 'send_sms'
  | 'get_clipboard'
  | 'set_clipboard'
  | 'find_contact'
  | 'get_location'
  | 'remember_fact'
  | 'search_web';

export interface ToolCall {
  name: ToolName;
  args: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output: string;
}

// ─── Tool executor ────────────────────────────────────────────────────────────
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.name) {
      case 'create_calendar_event': {
        const { title, start_date, end_date, notes } = call.args;
        const id = await createCalendarEvent(
          title,
          new Date(start_date),
          new Date(end_date),
          notes
        );
        return { success: !!id, output: id ? `נוצר אירוע: "${title}"` : 'שגיאה ביצירת אירוע' };
      }

      case 'send_sms': {
        const { contact_name, message } = call.args;
        const result = await sendSMSToContact(contact_name, message);
        return {
          success: result.success,
          output: result.success ? `הודעה נשלחה ל${contact_name}` : result.reason ?? 'שגיאה',
        };
      }

      case 'get_clipboard': {
        const text = await getClipboardText();
        return { success: true, output: text ?? '(clipboard ריק)' };
      }

      case 'set_clipboard': {
        await setClipboardText(call.args.text);
        return { success: true, output: 'הטקסט הועתק' };
      }

      case 'find_contact': {
        const contact = await findContactByName(call.args.name);
        if (!contact) return { success: false, output: `איש קשר לא נמצא: ${call.args.name}` };
        return {
          success: true,
          output: `${contact.name}: ${contact.phoneNumbers[0] ?? 'אין מספר'}`,
        };
      }

      case 'get_location': {
        const loc = await getCurrentLocation();
        return { success: true, output: loc ? `${loc.city}, ${loc.country}` : 'מיקום לא זמין' };
      }

      case 'remember_fact': {
        await saveFact(call.args.fact, 3);
        return { success: true, output: `שמרתי: "${call.args.fact}"` };
      }

      case 'search_web': {
        // Placeholder — integrate Perplexity or Brave Search API
        return { success: false, output: 'חיפוש אינטרנט לא מוגדר עדיין' };
      }

      default:
        return { success: false, output: `כלי לא ידוע: ${(call as any).name}` };
    }
  } catch (err: any) {
    return { success: false, output: `שגיאה: ${err?.message ?? err}` };
  }
}

// ─── Tool manifest for AI (sent in system prompt) ────────────────────────────
export const TOOL_MANIFEST = `
You have access to these tools. Use them by responding with JSON like:
{"tool": "create_calendar_event", "args": {"title": "...", "start_date": "ISO", "end_date": "ISO"}}

Available tools:
- create_calendar_event(title, start_date, end_date, notes?)
- send_sms(contact_name, message)
- get_clipboard() — read current clipboard
- set_clipboard(text) — write to clipboard
- find_contact(name) — look up phone/email
- get_location() — user's current city
- remember_fact(fact) — store a memory permanently

Only use a tool when explicitly needed. Otherwise reply normally.
`;

// ─── Parse tool call from AI response ────────────────────────────────────────
export function parseToolCall(text: string): ToolCall | null {
  const match = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed.tool && parsed.args) {
      return { name: parsed.tool as ToolName, args: parsed.args };
    }
  } catch {}
  return null;
}
