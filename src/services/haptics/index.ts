import * as Haptics from 'expo-haptics';

// Named haptic patterns with semantic meaning
export const HapticPattern = {
  wakeWordDetected: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await delay(80);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  processingStarted: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  responseArrived: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  stopWordDetected: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await delay(60);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  error: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  cameraCapture: async () => {
    await Haptics.selectionAsync();
  },

  triggerMatch: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await delay(50);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await delay(50);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },
} as const;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
