import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAccessibility } from '@/hooks/useAccessibility';

interface HighContrastTextProps extends TextProps {
  variant?: 'body' | 'heading' | 'caption' | 'label';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const BASE_SIZES = { sm: 12, md: 16, lg: 20, xl: 28 };

export function HighContrastText({ variant = 'body', size = 'md', style, children, ...props }: HighContrastTextProps) {
  const { theme, fontScale, isDark } = useTheme();
  const { isHighContrastEnabled, isBoldTextEnabled } = useAccessibility();

  const baseSize = BASE_SIZES[size] * fontScale;

  const textStyle = StyleSheet.create({
    text: {
      fontSize: baseSize,
      lineHeight: baseSize * 1.5,
      color: isHighContrastEnabled
        ? isDark ? '#FFFFFF' : '#000000'
        : theme.text,
      fontWeight: variant === 'heading' || isBoldTextEnabled ? '700' : '400',
      letterSpacing: variant === 'heading' ? 0.5 : 0,
    },
  });

  return (
    <Text
      style={[textStyle.text, style]}
      accessibilityRole={variant === 'heading' ? 'header' : 'text'}
      {...props}
    >
      {children}
    </Text>
  );
}
