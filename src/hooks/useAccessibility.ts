import { useEffect, useState, useCallback } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useStore } from '@/store';

export interface AccessibilityState {
  isScreenReaderEnabled: boolean;
  isReduceMotionEnabled: boolean;
  isReduceTransparencyEnabled: boolean;
  isBoldTextEnabled: boolean;
  isHighContrastEnabled: boolean;
  announceForAccessibility: (message: string) => void;
  setAccessibilityFocus: (ref: any) => void;
}

export function useAccessibility(): AccessibilityState {
  const { settings } = useStore((s) => ({ settings: s.settings }));

  const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [isReduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [isReduceTransparencyEnabled, setReduceTransparencyEnabled] = useState(false);
  const [isBoldTextEnabled, setBoldTextEnabled] = useState(false);

  useEffect(() => {
    const checkAccessibility = async () => {
      const [screenReader, reduceMotion, reduceTransparency, boldText] = await Promise.all([
        AccessibilityInfo.isScreenReaderEnabled(),
        AccessibilityInfo.isReduceMotionEnabled(),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isReduceTransparencyEnabled()
          : Promise.resolve(false),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isBoldTextEnabled()
          : Promise.resolve(false),
      ]);

      setScreenReaderEnabled(screenReader);
      setReduceMotionEnabled(reduceMotion);
      setReduceTransparencyEnabled(reduceTransparency);
      setBoldTextEnabled(boldText);
    };

    checkAccessibility();

    const screenReaderSub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderEnabled);
    const reduceMotionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);

    return () => {
      screenReaderSub.remove();
      reduceMotionSub.remove();
    };
  }, []);

  const announceForAccessibility = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const setAccessibilityFocus = useCallback((ref: any) => {
    if (ref?.current) {
      AccessibilityInfo.setAccessibilityFocus(ref.current);
    }
  }, []);

  const isHighContrastEnabled = settings.theme === 'high_contrast' || isBoldTextEnabled;

  return {
    isScreenReaderEnabled,
    isReduceMotionEnabled,
    isReduceTransparencyEnabled,
    isBoldTextEnabled,
    isHighContrastEnabled,
    announceForAccessibility,
    setAccessibilityFocus,
  };
}

export function useAnimationConfig() {
  const { isReduceMotionEnabled } = useAccessibility();

  return {
    duration: isReduceMotionEnabled ? 0 : 300,
    shouldAnimate: !isReduceMotionEnabled,
    springConfig: isReduceMotionEnabled
      ? { stiffness: 1000, damping: 500 }
      : { stiffness: 100, damping: 15 },
  };
}
