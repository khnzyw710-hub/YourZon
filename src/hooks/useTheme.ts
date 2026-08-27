import { useEffect, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from '@/store';
import { THEMES, ThemeName, ColorScheme, FONT_SCALES, getAutoTheme } from '@/services/ui/themes';

export interface ThemeState {
  theme: ColorScheme;
  themeName: ThemeName;
  fontScale: number;
  isDark: boolean;
  setTheme: (name: ThemeName) => void;
  setAutoTheme: () => void;
}

export function useTheme(): ThemeState {
  const systemScheme = useColorScheme();
  const { settings, updateSettings } = useStore((s) => ({ settings: s.settings, updateSettings: s.updateSettings }));

  const [currentThemeName, setCurrentThemeName] = useState<ThemeName>(
    (settings.theme as ThemeName) ?? 'dark'
  );

  useEffect(() => {
    if (settings.theme) {
      setCurrentThemeName(settings.theme as ThemeName);
    }
  }, [settings.theme]);

  const theme = THEMES[currentThemeName] ?? THEMES.dark;
  const fontScale = FONT_SCALES[(settings.fontSize as keyof typeof FONT_SCALES) ?? 'medium'] ?? 1.0;

  const setTheme = useCallback((name: ThemeName) => {
    setCurrentThemeName(name);
    updateSettings({ theme: name });
  }, [updateSettings]);

  const setAutoTheme = useCallback(() => {
    const autoName = getAutoTheme();
    setTheme(autoName);
  }, [setTheme]);

  const isDark = theme.background === THEMES.dark.background ||
    ['dark', 'midnight', 'ocean', 'sunset'].includes(currentThemeName);

  return {
    theme,
    themeName: currentThemeName,
    fontScale,
    isDark,
    setTheme,
    setAutoTheme,
  };
}
