import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { BACKGROUND_TASK_NAME } from '@/constants';

// ─── Notification channel (Android) ───────────────────────────────────────────
export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('zon-listener', {
      name: 'Zon Listener',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      showBadge: false,
    });
  }
}

// ─── Persistent foreground-service notification ───────────────────────────────
let _notifId: string | null = null;

export async function showListeningNotification() {
  await setupNotificationChannel();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Zon מאזינה',
      body: 'אמור את מילת ההפעלה כדי לשאול',
      sticky: true,
      autoDismiss: false,
      ...(Platform.OS === 'android' && {
        channelId: 'zon-listener',
        ongoing: true,
        priority: Notifications.AndroidNotificationPriority.LOW,
        smallIcon: 'notification_icon',
        color: '#6366f1',
      }),
    },
    trigger: null,
  });
  _notifId = id;
  return id;
}

export async function hideListeningNotification() {
  if (_notifId) {
    await Notifications.dismissNotificationAsync(_notifId);
    _notifId = null;
  }
}

// ─── Background task registration ─────────────────────────────────────────────
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  // Keep the JS runtime alive; actual listening is handled by the foreground service.
  // This task restarts recognition if the OS killed it.
  return BackgroundTask.BackgroundTaskResult.Success;
});

export async function registerBackgroundTask() {
  const status = await BackgroundTask.getStatusAsync();
  if (
    status === BackgroundTask.BackgroundTaskStatus.Restricted ||
    status === BackgroundTask.BackgroundTaskStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: 15, // seconds — OS may delay more on battery saver
    });
  }
}

export async function unregisterBackgroundTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  }
}
