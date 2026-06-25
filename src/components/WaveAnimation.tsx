import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '@/constants';
import type { ListeningState } from '@/store';

interface BarProps {
  state: ListeningState;
  delay: number;
  color: string;
}

function WaveBar({ state, delay, color }: BarProps) {
  const scale = useSharedValue(0.15);

  useEffect(() => {
    cancelAnimation(scale);
    if (state === 'passive') {
      scale.value = withDelay(
        delay,
        withRepeat(withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true)
      );
    } else if (state === 'active') {
      scale.value = withDelay(
        delay,
        withRepeat(withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) }), -1, true)
      );
    } else if (state === 'processing') {
      scale.value = withDelay(
        delay,
        withRepeat(withTiming(0.8, { duration: 600, easing: Easing.inOut(Easing.quad) }), -1, true)
      );
    } else {
      scale.value = withTiming(0.15, { duration: 300 });
    }
  }, [state]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
    opacity: 0.4 + scale.value * 0.6,
  }));

  return (
    <Animated.View style={[styles.bar, { backgroundColor: color, marginHorizontal: 3 }, animStyle]} />
  );
}

const BAR_COUNT = 7;
const DELAYS = [0, 80, 160, 240, 320, 240, 160];

interface Props {
  state: ListeningState;
  color?: string;
}

export default function WaveAnimation({ state, color = COLORS.accent }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <WaveBar key={i} state={state} delay={DELAYS[i] ?? 0} color={color} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  bar: {
    width: 5,
    height: 50,
    borderRadius: 3,
  },
});
