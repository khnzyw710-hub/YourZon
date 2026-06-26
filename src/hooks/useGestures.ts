import { useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { GestureResponderEvent, PanResponder } from 'react-native';
import { GestureAction, DEFAULT_BINDINGS } from '@/services/ui/gestures';
import { useStore } from '@/store';

export interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
}

const SWIPE_THRESHOLD = 50;
const DOUBLE_TAP_DELAY = 300;
const LONG_PRESS_DELAY = 600;

export function useGestures(handlers: GestureHandlers) {
  const { settings } = useStore((s) => ({ settings: s.settings }));
  const lastTapRef = useRef<number>(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const haptic = useCallback(() => {
    if (settings.hapticFeedback !== false) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [settings.hapticFeedback]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,

    onPanResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      touchStart.current = { x: pageX, y: pageY, time: Date.now() };

      longPressTimer.current = setTimeout(() => {
        if (handlers.onLongPress) {
          haptic();
          handlers.onLongPress();
        }
      }, LONG_PRESS_DELAY);
    },

    onPanResponderMove: () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    },

    onPanResponderRelease: (e: GestureResponderEvent, gs) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const { dx, dy } = gs;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > SWIPE_THRESHOLD || absDy > SWIPE_THRESHOLD) {
        haptic();
        if (absDx > absDy) {
          if (dx > 0) handlers.onSwipeRight?.();
          else handlers.onSwipeLeft?.();
        } else {
          if (dy > 0) handlers.onSwipeDown?.();
          else handlers.onSwipeUp?.();
        }
        return;
      }

      // Double tap detection
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
        haptic();
        handlers.onDoubleTap?.();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    },
  });

  return panResponder.panHandlers;
}

export function useGestureAction(action: GestureAction): () => void {
  const { settings } = useStore((s) => ({ settings: s.settings }));

  return useCallback(() => {
    // Gesture actions are routed through the app's navigation/command system
    // Each action maps to a specific app feature
    console.log(`[Gesture] Action triggered: ${action}`);
  }, [action]);
}
