import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
  allDay: boolean;
}

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const granted = await requestCalendarPermission();
  if (!granted) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((c) => c.id);

  const now = new Date();
  const events = await Calendar.getEventsAsync(
    calendarIds,
    startOfDay(now),
    endOfDay(now)
  );

  return events.map((e) => ({
    id: e.id,
    title: e.title ?? 'אירוע',
    startDate: new Date(e.startDate),
    endDate: new Date(e.endDate),
    location: e.location,
    notes: e.notes,
    allDay: e.allDay ?? false,
  }));
}

export async function getUpcomingEvents(days = 3): Promise<CalendarEvent[]> {
  const granted = await requestCalendarPermission();
  if (!granted) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendarIds = calendars.map((c) => c.id);
  const now = new Date();

  const events = await Calendar.getEventsAsync(calendarIds, now, addDays(now, days));

  return events.map((e) => ({
    id: e.id,
    title: e.title ?? 'אירוע',
    startDate: new Date(e.startDate),
    endDate: new Date(e.endDate),
    location: e.location,
    notes: e.notes,
    allDay: e.allDay ?? false,
  }));
}

export async function createCalendarEvent(
  title: string,
  startDate: Date,
  endDate: Date,
  notes?: string
): Promise<string | null> {
  const granted = await requestCalendarPermission();
  if (!granted) return null;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCal =
    calendars.find((c) => c.isPrimary) ??
    calendars.find((c) => c.allowsModifications) ??
    calendars[0];

  if (!defaultCal) return null;

  const id = await Calendar.createEventAsync(defaultCal.id, {
    title,
    startDate,
    endDate,
    notes,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return id;
}

export function formatEventForSpeech(event: CalendarEvent): string {
  const time = event.allDay
    ? 'כל היום'
    : format(event.startDate, 'HH:mm');
  return `${event.title} ב-${time}${event.location ? ` ב${event.location}` : ''}`;
}
