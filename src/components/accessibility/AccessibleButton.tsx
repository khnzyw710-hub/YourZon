import React, { useCallback } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, AccessibilityRole } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useAccessibility } from '@/hooks/useAccessibility';
import { useStore } from '@/store';

interface AccessibleButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  accessibilityHint?: string;
  role?: AccessibilityRole;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

const HEIGHTS = { sm: 36, md: 48, lg: 56 };
const FONT_SIZES = { sm: 14, md: 16, lg: 18 };

export function AccessibleButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  accessibilityHint,
  role = 'button',
  style,
  textStyle,
  icon,
}: AccessibleButtonProps) {
  const { theme } = useTheme();
  const { isScreenReaderEnabled } = useAccessibility();
  const { settings } = useStore((s) => ({ settings: s.settings }));

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (settings.hapticFeedback !== false) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress();
  }, [disabled, onPress, settings.hapticFeedback]);

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary': return { backgroundColor: theme.primary };
      case 'secondary': return { backgroundColor: theme.secondary };
      case 'danger': return { backgroundColor: '#FF3B30' };
      case 'ghost': return { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border };
      default: return { backgroundColor: theme.primary };
    }
  };

  const getTextColor = (): string => {
    if (variant === 'ghost') return theme.text;
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      accessible
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityRole={role}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        getVariantStyle(),
        { height: HEIGHTS[size], minWidth: HEIGHTS[size] * 2 },
        disabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.75}
    >
      {icon}
      <Text
        style={[
          styles.label,
          { color: getTextColor(), fontSize: FONT_SIZES[size] },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  label: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
