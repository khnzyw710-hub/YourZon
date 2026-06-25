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

interface Props {
  state: ListeningState;
  color?: string;
}

const BAR_COUNT = 7;

export default function WaveAnimation({ state, color = COLORS.accent }: Props) {
  const scales = Array.from({ length: BAR_COUNT }, () => useSharedValue(0.3));

  useEffect(() => {
    if (state === 'passive') {
      scales.forEach((s, i) => {
        s.value = withDelay(
          i * 80,
          withRepeat(
            withTiming(0.6, { duration: 900, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
          )
        );
      });
    } else if (state === 'active') {
      scales.forEach((s, i) => {
        s.value = withDelay(
          i * 60,
          withRepeat(
            withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
          )
        );
      });
    } else if (state === 'processing') {
      scales.forEach((s, i) => {
        s.value = withDelay(
          i * 100,
          withRepeat(
            withTiming(0.8, { duration: 600, easing: Easing.inOut(Easing.quad) }),
            -1,
            true
          )
        );
      });
    } else {
      scales.forEach((s) => {
        cancelAnimation(s);
        s.value = withTiming(0.15, { duration: 300 });
      });
    }
  }, [state]);

  return (
    <View style={styles.container}>
      {scales.map((scale, i) => {
        const animStyle = useAnimatedStyle(() => ({
          transform: [{ scaleY: scale.value }],
          opacity: 0.4 + scale.value * 0.6,
        }));
        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: color, marginHorizontal: 3 },
              animStyle,
            ]}
          />
        );
      })}
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
