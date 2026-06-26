import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Theme system ─────────────────────────────────────────────────────────────

export type ThemeName = 'dark' | 'light' | 'midnight' | 'nature' | 'ocean' | 'sunset' | 'minimal' | 'high_contrast';

export interface ColorScheme {
  background: string;
  surface: string;
  card: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  info: string;
}

export const THEMES: Record<ThemeName, ColorScheme> = {
  dark: {
    background: '#0A0A0A',
    surface: '#111111',
    card: '#1A1A1A',
    primary: '#7C3AED',
    secondary: '#4F46E5',
    accent: '#A78BFA',
    text: '#FFFFFF',
    textSecondary: '#E5E7EB',
    textMuted: '#9CA3AF',
    border: '#2D2D2D',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  light: {
    background: '#F9FAFB',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    primary: '#7C3AED',
    secondary: '#4F46E5',
    accent: '#6D28D9',
    text: '#111827',
    textSecondary: '#374151',
    textMuted: '#6B7280',
    border: '#E5E7EB',
    error: '#DC2626',
    success: '#059669',
    warning: '#D97706',
    info: '#2563EB',
  },
  midnight: {
    background: '#000010',
    surface: '#080820',
    card: '#0E0E2E',
    primary: '#818CF8',
    secondary: '#6366F1',
    accent: '#C4B5FD',
    text: '#F0F0FF',
    textSecondary: '#C7C7E8',
    textMuted: '#7E7EAA',
    border: '#1E1E40',
    error: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
    info: '#60A5FA',
  },
  nature: {
    background: '#0D1F0D',
    surface: '#0F2210',
    card: '#152615',
    primary: '#22C55E',
    secondary: '#16A34A',
    accent: '#86EFAC',
    text: '#F0FFF0',
    textSecondary: '#DCFCE7',
    textMuted: '#86EFAC',
    border: '#1A3A1A',
    error: '#EF4444',
    success: '#4ADE80',
    warning: '#FBBF24',
    info: '#38BDF8',
  },
  ocean: {
    background: '#030D18',
    surface: '#061525',
    card: '#0A1F35',
    primary: '#0EA5E9',
    secondary: '#0284C7',
    accent: '#7DD3FC',
    text: '#F0F9FF',
    textSecondary: '#E0F2FE',
    textMuted: '#7DD3FC',
    border: '#0C2840',
    error: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
    info: '#38BDF8',
  },
  sunset: {
    background: '#1A0A00',
    surface: '#2D1200',
    card: '#3D1A00',
    primary: '#F97316',
    secondary: '#EA580C',
    accent: '#FED7AA',
    text: '#FFF7ED',
    textSecondary: '#FED7AA',
    textMuted: '#FB923C',
    border: '#431A00',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  minimal: {
    background: '#FAFAFA',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    primary: '#18181B',
    secondary: '#27272A',
    accent: '#71717A',
    text: '#09090B',
    textSecondary: '#18181B',
    textMuted: '#71717A',
    border: '#E4E4E7',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#EAB308',
    info: '#3B82F6',
  },
  high_contrast: {
    background: '#000000',
    surface: '#000000',
    card: '#111111',
    primary: '#FFFF00',
    secondary: '#00FF00',
    accent: '#00FFFF',
    text: '#FFFFFF',
    textSecondary: '#FFFF00',
    textMuted: '#AAAAAA',
    border: '#FFFFFF',
    error: '#FF0000',
    success: '#00FF00',
    warning: '#FFFF00',
    info: '#00FFFF',
  },
};

// ─── Theme state ──────────────────────────────────────────────────────────────
let _currentTheme: ThemeName = 'dark';

export async function loadTheme(): Promise<ThemeName> {
  try {
    const saved = await AsyncStorage.getItem('zon_theme');
    if (saved && THEMES[saved as ThemeName]) {
      _currentTheme = saved as ThemeName;
    }
  } catch {}
  return _currentTheme;
}

export async function setTheme(theme: ThemeName): Promise<void> {
  _currentTheme = theme;
  await AsyncStorage.setItem('zon_theme', theme);
}

export function getCurrentTheme(): ThemeName {
  return _currentTheme;
}

export function getColors(): ColorScheme {
  return THEMES[_currentTheme];
}

// ─── Custom color accent ──────────────────────────────────────────────────────
export async function setCustomAccent(color: string): Promise<void> {
  await AsyncStorage.setItem('zon_custom_accent', color);
}

export async function getCustomAccent(): Promise<string | null> {
  return AsyncStorage.getItem('zon_custom_accent');
}

// ─── Auto theme based on time ─────────────────────────────────────────────────
export function getAutoTheme(): ThemeName {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 18) return 'light';
  if (hour >= 18 && hour < 21) return 'sunset';
  return 'dark';
}

// ─── Font size ────────────────────────────────────────────────────────────────
export type FontSize = 'small' | 'medium' | 'large' | 'xl';

export const FONT_SCALES: Record<FontSize, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
  xl: 1.4,
};

export async function getFontSize(): Promise<FontSize> {
  const saved = await AsyncStorage.getItem('zon_font_size').catch(() => null);
  return (saved as FontSize) ?? 'medium';
}

export async function setFontSize(size: FontSize): Promise<void> {
  await AsyncStorage.setItem('zon_font_size', size);
}

export async function getFontScale(): Promise<number> {
  const size = await getFontSize();
  return FONT_SCALES[size];
}
