import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';

export interface ShareCardProps {
  title: string;
  subtitle?: string;
  value?: string;
  valueLabel?: string;
  badge?: string;
  footer?: string;
  accentColor?: string;
  onShare?: () => void;
  shareText?: string;
  style?: ViewStyle;
}

export function ShareCard({
  title,
  subtitle,
  value,
  valueLabel,
  badge,
  footer,
  accentColor,
  onShare,
  shareText,
  style,
}: ShareCardProps) {
  const { theme } = useTheme();
  const accent = accentColor ?? theme.primary;

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (onShare) {
      onShare();
      return;
    }

    const text = shareText ?? [
      title,
      subtitle ?? '',
      value ? `${valueLabel ?? 'Value'}: ${value}` : '',
      footer ?? '',
      '\nשותף דרך ZON AI',
    ].filter(Boolean).join('\n');

    await Share.share({ message: text, title });
  }, [title, subtitle, value, valueLabel, footer, shareText, onShare]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: accent }, style]}>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}

      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}

        {value ? (
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: accent }]}>{value}</Text>
            {valueLabel ? <Text style={[styles.valueLabel, { color: theme.textSecondary }]}>{valueLabel}</Text> : null}
          </View>
        ) : null}
      </View>

      {footer ? (
        <Text style={[styles.footer, { color: theme.textSecondary, borderTopColor: theme.border }]}>{footer}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.shareBtn, { borderColor: theme.border }]}
        onPress={handleShare}
        accessibilityLabel="Share"
        accessibilityRole="button"
      >
        <Text style={[styles.shareBtnText, { color: accent }]}>שתף</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 8,
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    zIndex: 1,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  body: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 8,
  },
  value: {
    fontSize: 32,
    fontWeight: '800',
  },
  valueLabel: {
    fontSize: 14,
  },
  footer: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shareBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
