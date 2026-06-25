import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Trigger {
  id: string;
  phrase: string;          // e.g. "שלח לבוס"
  action: TriggerAction;
}

export type TriggerAction =
  | { type: 'sms'; contactName: string; message: string }
  | { type: 'ai_query'; prompt: string }
  | { type: 'clipboard_read' }
  | { type: 'reminder'; minutesFromNow: number; text: string };

export interface Routine {
  id: string;
  name: string;
  schedule: { hour: number; minute: number };  // 24h
  prompt: string;   // sent to AI to generate the briefing
  enabled: boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const TRIGGERS_KEY = 'zon_triggers';
const ROUTINES_KEY = 'zon_routines';

export async function getTriggers(): Promise<Trigger[]> {
  const json = await AsyncStorage.getItem(TRIGGERS_KEY);
  return json ? JSON.parse(json) : [];
}

export async function saveTrigger(trigger: Trigger): Promise<void> {
  const list = await getTriggers();
  const existing = list.findIndex((t) => t.id === trigger.id);
  if (existing >= 0) list[existing] = trigger;
  else list.push(trigger);
  await AsyncStorage.setItem(TRIGGERS_KEY, JSON.stringify(list));
}

export async function deleteTrigger(id: string): Promise<void> {
  const list = await getTriggers();
  await AsyncStorage.setItem(TRIGGERS_KEY, JSON.stringify(list.filter((t) => t.id !== id)));
}

export async function getRoutines(): Promise<Routine[]> {
  const json = await AsyncStorage.getItem(ROUTINES_KEY);
  return json
    ? JSON.parse(json)
    : [
        {
          id: 'morning',
          name: 'בריפינג בוקר',
          schedule: { hour: 7, minute: 30 },
          prompt: 'תן לי בריפינג בוקר קצר: לוח היום, עדיפויות, ומשהו מעניין.',
          enabled: false,
        },
        {
          id: 'evening',
          name: 'סיכום ערב',
          schedule: { hour: 21, minute: 0 },
          prompt: 'סכם לי את היום בקצרה ותן הצעה אחת למחר.',
          enabled: false,
        },
      ];
}

export async function saveRoutine(routine: Routine): Promise<void> {
  const list = await getRoutines();
  const existing = list.findIndex((r) => r.id === routine.id);
  if (existing >= 0) list[existing] = routine;
  else list.push(routine);
  await AsyncStorage.setItem(ROUTINES_KEY, JSON.stringify(list));
}

// ─── Match a transcript against saved triggers ────────────────────────────────
export async function matchTrigger(transcript: string): Promise<Trigger | null> {
  const triggers = await getTriggers();
  const lower = transcript.toLowerCase();
  return triggers.find((t) => lower.includes(t.phrase.toLowerCase())) ?? null;
}

// ─── Generate unique id ───────────────────────────────────────────────────────
export function makeTriggerId(): string {
  return `trigger_${Date.now().toString(36)}`;
}
