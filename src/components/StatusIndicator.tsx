import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, AI_PROVIDERS } from '@/constants';
import type { ListeningState } from '@/store';
import type { AIProvider } from '@/constants';

interface Props {
  state: ListeningState;
  activeProvider: AIProvider | null;
}

const STATE_LABELS: Record<ListeningState, string> = {
  off: 'כבוי',
  passive: 'מאזינה...',
  active: 'מקשיבה',
  processing: 'מעבדת...',
};

const STATE_COLORS: Record<ListeningState, string> = {
  off: COLORS.textDim,
  passive: COLORS.textMuted,
  active: COLORS.success,
  processing: COLORS.warning,
};

export default function StatusIndicator({ state, activeProvider }: Props) {
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    if (state === 'active' || state === 'processing') {
      pulse.value = withRepeat(withTiming(1.4, { duration: 700 }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 300 });
    }
  }, [state]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: state === 'off' ? 0.3 : 1,
  }));

  const dotColor = STATE_COLORS[state];
  const provider = activeProvider ? AI_PROVIDERS[activeProvider] : null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle]} />
      <Text style={[styles.label, { color: dotColor }]}>{STATE_LABELS[state]}</Text>
      {provider && (
        <View style={[styles.providerChip, { borderColor: provider.color }]}>
          <Text style={[styles.providerText, { color: provider.color }]}>{provider.name}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  providerChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  providerText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
