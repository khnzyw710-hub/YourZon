import * as Notifications from 'expo-notifications';
import { getTodayEvents, formatEventForSpeech } from './calendar';
import { getCurrentLocation } from './location';
import { routeToAI } from '@/services/ai/router';
import { speak } from '@/services/speech/synthesis';
import { useZonStore } from '@/store';
import { format } from 'date-fns';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Morning briefing ─────────────────────────────────────────────────────────
export async function deliverMorningBriefing(): Promise<void> {
  const settings = useZonStore.getState().settings;
  if (!settings.ttsEnabled) return;

  const events = await getTodayEvents();
  const location = await getCurrentLocation();

  const context = [
    `היום: ${format(new Date(), 'EEEE, d MMMM yyyy')}`,
    location ? `מיקום: ${location.city}` : null,
    events.length
      ? `אירועים היום:\n${events.map(formatEventForSpeech).join('\n')}`
      : 'אין אירועים מתוכננים היום',
  ]
    .filter(Boolean)
    .join('\n');

  const { response } = await routeToAI(
    `תן לי בריפינג בוקר קצר ב-3-4 משפטים: ${context}`,
    [],
    settings
  );

  await speak(response, settings.ttsRate);
}

// ─── Evening summary ──────────────────────────────────────────────────────────
export async function deliverEveningSummary(): Promise<void> {
  const settings = useZonStore.getState().settings;
  const store = useZonStore.getState();
  if (!settings.ttsEnabled) return;

  const msgCount = store.currentConversation?.messages.length ?? 0;

  const { response } = await routeToAI(
    `סכם לי את הערב בקצרה. היו ${msgCount} הודעות בשיחה היום.`,
    store.currentConversation?.messages.slice(-10) ?? [],
    settings
  );

  await speak(response, settings.ttsRate);
}

// ─── Upcoming event reminder ──────────────────────────────────────────────────
export async function scheduleEventReminder(
  title: string,
  triggerDate: Date
): Promise<void> {
  await requestNotificationPermission();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Zon מזכירה',
      body: `בעוד 10 דקות: ${title}`,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerDate.getTime() - 10 * 60 * 1000),
    },
  });
}

// ─── Monitor upcoming events and auto-schedule reminders ─────────────────────
export async function watchCalendarForReminders(): Promise<void> {
  const events = await getTodayEvents();
  for (const event of events) {
    if (event.startDate > new Date()) {
      await scheduleEventReminder(event.title, event.startDate);
    }
  }
}
