import * as SQLite from 'expo-sqlite';
import { Settings } from '@/store';

// ─── Home screen widget configuration ────────────────────────────────────────
// Widget layout management for the ZON dashboard home screen

export type WidgetSize = 'small' | 'medium' | 'large' | 'full';
export type WidgetType =
  | 'health_summary'
  | 'finance_balance'
  | 'tasks_today'
  | 'ai_quick_input'
  | 'weather'
  | 'focus_timer'
  | 'news_briefing'
  | 'crypto_ticker'
  | 'mood_check'
  | 'sleep_score'
  | 'water_tracker'
  | 'calendar_next'
  | 'device_controls'
  | 'quick_notes';

export interface Widget {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  position: number;
  title?: string;
  accentColor?: string;
  config: Record<string, any>;
  visible: boolean;
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'w1', type: 'ai_quick_input', size: 'medium', position: 0, title: 'ZON AI', config: {}, visible: true },
  { id: 'w2', type: 'tasks_today', size: 'medium', position: 1, title: 'Today\'s Tasks', config: { maxItems: 5 }, visible: true },
  { id: 'w3', type: 'health_summary', size: 'small', position: 2, title: 'Health', config: { showSleep: true, showSteps: true }, visible: true },
  { id: 'w4', type: 'finance_balance', size: 'small', position: 3, title: 'Finance', config: { showMonthlySpend: true }, visible: true },
  { id: 'w5', type: 'weather', size: 'small', position: 4, title: 'Weather', config: {}, visible: true },
  { id: 'w6', type: 'calendar_next', size: 'medium', position: 5, title: 'Next Event', config: {}, visible: true },
];

const WIDGETS_KEY = 'zon_widgets_layout';

export async function getWidgetLayout(): Promise<Widget[]> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(WIDGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_WIDGETS;
}

export async function saveWidgetLayout(widgets: Widget[]): Promise<void> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
  } catch {}
}

export async function addWidget(type: WidgetType, size: WidgetSize = 'medium', config: Record<string, any> = {}): Promise<Widget> {
  const existing = await getWidgetLayout();
  const newWidget: Widget = {
    id: `w${Date.now().toString(36)}`,
    type,
    size,
    position: existing.length,
    config,
    visible: true,
  };
  await saveWidgetLayout([...existing, newWidget]);
  return newWidget;
}

export async function removeWidget(id: string): Promise<void> {
  const existing = await getWidgetLayout();
  await saveWidgetLayout(existing.filter((w) => w.id !== id));
}

export async function reorderWidgets(ids: string[]): Promise<void> {
  const existing = await getWidgetLayout();
  const widgetMap = new Map(existing.map((w) => [w.id, w]));
  const reordered = ids
    .map((id, position) => {
      const widget = widgetMap.get(id);
      return widget ? { ...widget, position } : null;
    })
    .filter(Boolean) as Widget[];
  await saveWidgetLayout(reordered);
}

export async function updateWidgetConfig(id: string, config: Partial<Widget>): Promise<void> {
  const existing = await getWidgetLayout();
  const updated = existing.map((w) => w.id === id ? { ...w, ...config } : w);
  await saveWidgetLayout(updated);
}

export function getWidgetDisplayName(type: WidgetType): string {
  const names: Record<WidgetType, string> = {
    health_summary: 'Health Summary',
    finance_balance: 'Finance Balance',
    tasks_today: 'Today\'s Tasks',
    ai_quick_input: 'AI Quick Input',
    weather: 'Weather',
    focus_timer: 'Focus Timer',
    news_briefing: 'News Briefing',
    crypto_ticker: 'Crypto Ticker',
    mood_check: 'Mood Check-in',
    sleep_score: 'Sleep Score',
    water_tracker: 'Water Tracker',
    calendar_next: 'Next Calendar Event',
    device_controls: 'Device Controls',
    quick_notes: 'Quick Notes',
  };
  return names[type] ?? type;
}

export const WIDGET_SIZE_COLS: Record<WidgetSize, number> = {
  small: 1,
  medium: 2,
  large: 2,
  full: 2,
};
