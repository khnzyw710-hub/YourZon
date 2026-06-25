import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  RadialGradient,
  vec,
  BlurMask,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { COLORS } from '@/constants';
import type { ListeningState } from '@/store';

interface Props {
  state: ListeningState;
  size?: number;
}

const STATE_CONFIG: Record<ListeningState, { color: string; innerColor: string; scale: number; speed: number }> = {
  off: {
    color: '#1a1a2e',
    innerColor: '#16213e',
    scale: 0.55,
    speed: 3000,
  },
  passive: {
    color: '#312e81',
    innerColor: '#4338ca',
    scale: 0.7,
    speed: 2200,
  },
  active: {
    color: '#166534',
    innerColor: '#22c55e',
    scale: 0.95,
    speed: 800,
  },
  processing: {
    color: '#78350f',
    innerColor: '#f59e0b',
    scale: 0.82,
    speed: 500,
  },
};

export default function ZonOrb({ state, size = 160 }: Props) {
  const scale = useSharedValue(0.6);
  const rotation = useSharedValue(0);
  const glow = useSharedValue(0.3);

  const config = STATE_CONFIG[state];
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.7;

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(glow);
    cancelAnimation(scale);

    scale.value = withSpring(config.scale, { damping: 12, stiffness: 80 });

    if (state !== 'off') {
      rotation.value = withRepeat(
        withTiming(360, { duration: config.speed, easing: Easing.linear }),
        -1,
        false
      );
      glow.value = withRepeat(
        withTiming(1, { duration: config.speed / 2, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      rotation.value = withTiming(0, { duration: 800 });
      glow.value = withTiming(0.15, { duration: 600 });
    }
  }, [state]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(glow.value, [0, 1], [0.6, 1]),
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Outer glow */}
        <Circle cx={cx} cy={cy} r={r + 20}>
          <RadialGradient
            c={vec(cx, cy)}
            r={r + 20}
            colors={[config.innerColor + '44', 'transparent']}
          />
          <BlurMask blur={18} style="normal" />
        </Circle>

        {/* Core orb */}
        <Circle cx={cx} cy={cy} r={r}>
          <RadialGradient
            c={vec(cx - r * 0.2, cy - r * 0.25)}
            r={r * 1.2}
            colors={[config.innerColor, config.color, '#000']}
          />
        </Circle>

        {/* Bright specular highlight */}
        <Circle cx={cx - r * 0.28} cy={cy - r * 0.28} r={r * 0.22}>
          <RadialGradient
            c={vec(cx - r * 0.28, cy - r * 0.28)}
            r={r * 0.22}
            colors={['rgba(255,255,255,0.25)', 'transparent']}
          />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}
