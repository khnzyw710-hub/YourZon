import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createCalendarEvent } from '@/services/integrations/calendar';
import { sendSMSToContact } from '@/services/integrations/sms';
import { getClipboardText, setClipboardText } from '@/services/integrations/clipboard';
import { findContactByName } from '@/services/integrations/contacts';
import { getCurrentLocation } from '@/services/integrations/location';
import { saveFact } from '@/services/memory';
import { queryEntity } from '@/services/knowledge/graph';
import { markCommitmentDone } from '@/services/commitments';
import { startFocus, stopFocus } from '@/services/focus';

// ─── Tool definitions ─────────────────────────────────────────────────────────
export type ToolName =
  | 'create_calendar_event'
  | 'send_sms'
  | 'get_clipboard'
  | 'set_clipboard'
  | 'find_contact'
  | 'get_location'
  | 'remember_fact'
  | 'search_web'
  | 'call_phone'
  | 'open_whatsapp'
  | 'open_maps'
  | 'set_reminder'
  | 'set_timer'
  | 'calculate'
  | 'generate_image'
  | 'get_weather'
  | 'lookup_entity'
  | 'complete_commitment'
  | 'start_focus'
  | 'stop_focus'
  | 'open_url'
  | 'send_email';

export interface ToolCall {
  name: ToolName;
  args: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: any;
}

// ─── Safe math evaluator ──────────────────────────────────────────────────────
function safeCalculate(expr: string): number | null {
  try {
    // Allow only safe characters
    if (!/^[\d\s\+\-\*\/\(\)\.\%\^√]+$/.test(expr.replace(/sqrt|pow|Math\.\w+/g, ''))) {
      return null;
    }
    const sanitized = expr
      .replace(/√(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)')
      .replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${sanitized})`)() as number;
  } catch {
    return null;
  }
}

// ─── Tool executor ────────────────────────────────────────────────────────────
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.name) {
      // ── Calendar ────────────────────────────────────────────────────────────
      case 'create_calendar_event': {
        const { title, start_date, end_date, notes } = call.args;
        const id = await createCalendarEvent(
          title,
          new Date(start_date),
          new Date(end_date),
          notes
        );
        return { success: !!id, output: id ? `✅ נוצר אירוע: "${title}"` : 'שגיאה ביצירת אירוע' };
      }

      // ── SMS ─────────────────────────────────────────────────────────────────
      case 'send_sms': {
        const { contact_name, message } = call.args;
        const result = await sendSMSToContact(contact_name, message);
        return {
          success: result.success,
          output: result.success ? `✅ הודעה נשלחה ל${contact_name}` : result.reason ?? 'שגיאה',
        };
      }

      // ── Clipboard ───────────────────────────────────────────────────────────
      case 'get_clipboard': {
        const text = await getClipboardText();
        return { success: true, output: text ?? '(clipboard ריק)' };
      }

      case 'set_clipboard': {
        await setClipboardText(call.args.text);
        return { success: true, output: '✅ הטקסט הועתק' };
      }

      // ── Contacts ────────────────────────────────────────────────────────────
      case 'find_contact': {
        const contact = await findContactByName(call.args.name);
        if (!contact) return { success: false, output: `❌ איש קשר לא נמצא: ${call.args.name}` };
        return {
          success: true,
          output: `👤 ${contact.name}: ${contact.phoneNumbers?.[0] ?? 'אין מספר'}`,
        };
      }

      // ── Location ────────────────────────────────────────────────────────────
      case 'get_location': {
        const loc = await getCurrentLocation();
        return { success: true, output: loc ? `📍 ${loc.city}, ${loc.country}` : 'מיקום לא זמין' };
      }

      // ── Memory ──────────────────────────────────────────────────────────────
      case 'remember_fact': {
        await saveFact(call.args.fact, call.args.importance ?? 3);
        return { success: true, output: `🧠 שמרתי: "${call.args.fact}"` };
      }

      // ── Phone call ──────────────────────────────────────────────────────────
      case 'call_phone': {
        const { number, contact_name } = call.args;
        let phone = number;
        if (!phone && contact_name) {
          const contact = await findContactByName(contact_name);
          phone = contact?.phoneNumbers?.[0];
        }
        if (!phone) return { success: false, output: '❌ לא נמצא מספר טלפון' };
        const url = `tel:${phone.replace(/\s+/g, '')}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        return { success: ok, output: ok ? `📞 מתקשר ל${contact_name ?? phone}` : '❌ לא ניתן לחייג' };
      }

      // ── WhatsApp ────────────────────────────────────────────────────────────
      case 'open_whatsapp': {
        const { number, contact_name, message } = call.args;
        let phone = number;
        if (!phone && contact_name) {
          const contact = await findContactByName(contact_name);
          phone = contact?.phoneNumbers?.[0];
        }
        if (!phone) return { success: false, output: '❌ לא נמצא מספר' };
        const clean = phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '972');
        const msg = message ? encodeURIComponent(message) : '';
        const url = `whatsapp://send?phone=${clean}${msg ? `&text=${msg}` : ''}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        else await Linking.openURL(`https://wa.me/${clean}${msg ? `?text=${msg}` : ''}`);
        return { success: true, output: `💬 פתוח WhatsApp עם ${contact_name ?? phone}` };
      }

      // ── Maps ────────────────────────────────────────────────────────────────
      case 'open_maps': {
        const { destination, query } = call.args;
        const search = encodeURIComponent(destination ?? query ?? '');
        const iosUrl = `maps:?q=${search}`;
        const androidUrl = `geo:0,0?q=${search}`;
        const webUrl = `https://maps.google.com/?q=${search}`;
        const canIOS = await Linking.canOpenURL(iosUrl);
        if (canIOS) await Linking.openURL(iosUrl);
        else {
          const canAndroid = await Linking.canOpenURL(androidUrl);
          await Linking.openURL(canAndroid ? androidUrl : webUrl);
        }
        return { success: true, output: `🗺️ פותח מפה: ${destination ?? query}` };
      }

      // ── Scheduled reminder ──────────────────────────────────────────────────
      case 'set_reminder': {
        const { text, minutes, hours, date_iso } = call.args;
        let triggerDate: Date;
        if (date_iso) {
          triggerDate = new Date(date_iso);
        } else {
          const delayMs = ((hours ?? 0) * 60 + (minutes ?? 30)) * 60000;
          triggerDate = new Date(Date.now() + delayMs);
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🔔 תזכורת מ-ZON',
            body: text,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });

        const timeStr = triggerDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        return { success: true, output: `⏰ תזכורת נקבעה ל-${timeStr}: "${text}"` };
      }

      // ── Timer ───────────────────────────────────────────────────────────────
      case 'set_timer': {
        const { minutes, seconds, label } = call.args;
        const totalSec = (minutes ?? 0) * 60 + (seconds ?? 0);
        if (totalSec <= 0) return { success: false, output: '❌ זמן לא תקין' };

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏱️ ${label ?? 'טיימר'} הסתיים`,
            body: `עברו ${minutes ? `${minutes} דקות` : `${seconds} שניות`}`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: totalSec },
        });

        return {
          success: true,
          output: `⏱️ טיימר הופעל: ${minutes ? `${minutes} דקות` : `${seconds} שניות`}${label ? ` — ${label}` : ''}`,
        };
      }

      // ── Calculator ──────────────────────────────────────────────────────────
      case 'calculate': {
        const { expression } = call.args;
        const result = safeCalculate(expression);
        if (result === null) return { success: false, output: '❌ לא ניתן לחשב את הביטוי' };
        const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');
        return { success: true, output: `🧮 ${expression} = ${formatted}`, data: { result } };
      }

      // ── Weather ─────────────────────────────────────────────────────────────
      case 'get_weather': {
        const { city, weather_api_key } = call.args;
        const key = weather_api_key;
        if (!key) return { success: false, output: '❌ נדרש מפתח OpenWeatherMap' };

        const loc = city ?? (await getCurrentLocation().then((l) => l?.city).catch(() => null));
        if (!loc) return { success: false, output: '❌ לא ניתן לקבל מיקום' };

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc)}&appid=${key}&units=metric&lang=he`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) return { success: false, output: `❌ שגיאת מזג אוויר: ${data.message}` };

        const temp = Math.round(data.main.temp);
        const feels = Math.round(data.main.feels_like);
        const desc = data.weather?.[0]?.description ?? '';
        const humidity = data.main.humidity;
        const wind = Math.round(data.wind?.speed * 3.6);

        return {
          success: true,
          output: `🌤️ ${loc}: ${temp}°C (מרגיש ${feels}°C) · ${desc} · לחות ${humidity}% · רוח ${wind} קמ"ש`,
          data,
        };
      }

      // ── Image generation ─────────────────────────────────────────────────────
      case 'generate_image': {
        const { prompt, openai_key, size = '1024x1024', quality = 'standard' } = call.args;
        const key = openai_key;
        if (!key) return { success: false, output: '❌ נדרש מפתח OpenAI ליצירת תמונות' };

        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size,
            quality,
          }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, output: `❌ שגיאה: ${data.error?.message}` };
        const imageUrl = data.data?.[0]?.url;
        return {
          success: true,
          output: `🎨 תמונה נוצרה: ${imageUrl}`,
          data: { url: imageUrl, revised_prompt: data.data?.[0]?.revised_prompt },
        };
      }

      // ── Web search (via Grok API) ────────────────────────────────────────────
      case 'search_web': {
        const { query, grok_key } = call.args;
        if (!grok_key) return { success: false, output: `חפש "${query}" באינטרנט` };
        // Grok handles web search natively through the chat API — just return query
        return { success: true, output: `🔍 מחפש: "${query}"` };
      }

      // ── Knowledge graph lookup ───────────────────────────────────────────────
      case 'lookup_entity': {
        const { name } = call.args;
        const result = await queryEntity(name);
        if (!result) return { success: false, output: `❌ לא נמצא מידע על "${name}"` };
        const rel = result.relations.slice(0, 3).map((r) => `${r.fromEntity} ${r.relation} ${r.toEntity}`).join(', ');
        return {
          success: true,
          output: `📚 ${result.entity.name} (${result.entity.type}): הוזכר ${result.entity.mentionCount} פעם${rel ? `. קשרים: ${rel}` : ''}`,
          data: result,
        };
      }

      // ── Complete commitment ──────────────────────────────────────────────────
      case 'complete_commitment': {
        const { id } = call.args;
        await markCommitmentDone(Number(id));
        return { success: true, output: `✅ סומן כבוצע` };
      }

      // ── Focus mode ──────────────────────────────────────────────────────────
      case 'start_focus': {
        const { goal } = call.args;
        const state = await startFocus(goal);
        return { success: true, output: `🎯 מצב פוקוס הופעל${goal ? ` — ${goal}` : ''} (25 דקות)` };
      }

      case 'stop_focus': {
        await stopFocus('הפסקה מוקדמת');
        return { success: true, output: `✋ פוקוס הופסק` };
      }

      // ── Open URL ────────────────────────────────────────────────────────────
      case 'open_url': {
        const { url } = call.args;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        return { success: ok, output: ok ? `🌐 פתוח: ${url}` : `❌ לא ניתן לפתוח: ${url}` };
      }

      // ── Email ───────────────────────────────────────────────────────────────
      case 'send_email': {
        const { to, subject, body } = call.args;
        const url = `mailto:${to}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(body ?? '')}`;
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        return { success: ok, output: ok ? `📧 פותח מייל ל${to}` : `❌ לא ניתן לפתוח מייל` };
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
You are JARVIS-level AI with full tool access. Respond with JSON to use a tool:
{"tool": "<name>", "args": {<args>}}

COMMUNICATION:
- call_phone(number?, contact_name?) — make a phone call
- send_sms(contact_name, message) — send SMS
- open_whatsapp(number?, contact_name?, message?) — open WhatsApp chat
- send_email(to, subject?, body?) — compose email

SCHEDULING:
- create_calendar_event(title, start_date, end_date, notes?) — add to calendar
- set_reminder(text, minutes?, hours?, date_iso?) — scheduled notification
- set_timer(minutes?, seconds?, label?) — countdown timer

INFORMATION:
- get_location() — user's current city/country
- get_weather(city?, weather_api_key) — live weather data
- search_web(query, grok_key?) — search the internet
- find_contact(name) — look up phone/email from contacts
- lookup_entity(name) — query knowledge graph about a person/place/project
- calculate(expression) — math: "√144 + 3^2", "15% of 340"

MEMORY & KNOWLEDGE:
- remember_fact(fact, importance?) — store permanent memory
- complete_commitment(id) — mark commitment as done

PRODUCTIVITY:
- start_focus(goal?) — start 25-minute Pomodoro
- stop_focus() — end focus session

CONTENT:
- generate_image(prompt, openai_key, size?, quality?) — DALL-E 3 image
- get_clipboard() / set_clipboard(text) — clipboard access
- open_url(url) — open any URL or deep link
- open_maps(destination) — navigate to location

Use tools proactively when the user clearly wants an action.
Only use a tool when needed. Otherwise reply normally in Hebrew.
`;

// ─── Parse tool call from AI response ────────────────────────────────────────
export function parseToolCall(text: string): ToolCall | null {
  const match = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed.tool && parsed.args !== undefined) {
      return { name: parsed.tool as ToolName, args: parsed.args ?? {} };
    }
  } catch {}
  return null;
}
