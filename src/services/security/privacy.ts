import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Privacy controls ─────────────────────────────────────────────────────────

export interface PrivacySettings {
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;
  conversationRetentionDays: number;
  locationEnabled: boolean;
  microphoneAlwaysOn: boolean;
  shareWithThirdParties: boolean;
  autoDeleteAfterDays: number;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  analyticsEnabled: false,
  crashReportingEnabled: false,
  conversationRetentionDays: 30,
  locationEnabled: false,
  microphoneAlwaysOn: false,
  shareWithThirdParties: false,
  autoDeleteAfterDays: 90,
};

export async function getPrivacySettings(): Promise<PrivacySettings> {
  try {
    const raw = await AsyncStorage.getItem('zon_privacy_settings');
    if (raw) return { ...DEFAULT_PRIVACY, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PRIVACY };
}

export async function updatePrivacySettings(updates: Partial<PrivacySettings>): Promise<void> {
  const current = await getPrivacySettings();
  const updated = { ...current, ...updates };
  await AsyncStorage.setItem('zon_privacy_settings', JSON.stringify(updated));
}

// ─── Data deletion ────────────────────────────────────────────────────────────
export async function deleteConversationsBefore(date: string): Promise<number> {
  const convRaw = await AsyncStorage.getItem('conversations');
  if (!convRaw) return 0;

  const convs = JSON.parse(convRaw) as Array<{ createdAt: number; messages?: any[] }>;
  const cutoff = new Date(date).getTime();
  const filtered = convs.filter((c) => c.createdAt > cutoff);
  const deleted = convs.length - filtered.length;

  await AsyncStorage.setItem('conversations', JSON.stringify(filtered));
  return deleted;
}

export async function clearAllLocalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const zonKeys = keys.filter((k) => k.startsWith('zon_') || k === 'conversations' || k === 'settings');
  await AsyncStorage.multiRemove(zonKeys);
}

export async function exportAllData(): Promise<Record<string, any>> {
  const keys = await AsyncStorage.getAllKeys();
  const zonKeys = keys.filter((k) => k.startsWith('zon_') || k === 'conversations');
  const pairs = await AsyncStorage.multiGet(zonKeys);

  const data: Record<string, any> = {};
  for (const [key, value] of pairs) {
    try {
      data[key] = value ? JSON.parse(value) : null;
    } catch {
      data[key] = value;
    }
  }
  return data;
}

// ─── Privacy audit ────────────────────────────────────────────────────────────
export async function getPrivacyAuditReport(): Promise<{
  dataStored: string[];
  dataSentToCloud: string[];
  permissions: string[];
  recommendations: string[];
}> {
  const settings = await getPrivacySettings();

  const dataStored = [
    'Conversations (local SQLite)',
    'AI responses (local cache)',
    'Voice transcripts (in-memory only)',
    'Health data (local SQLite)',
    'Finance data (local SQLite)',
  ];

  const dataSentToCloud = [
    'Query text → AI providers (Claude/OpenAI/Gemini/Grok)',
    settings.locationEnabled ? 'Location → AI context (text only, not coordinates)' : null,
  ].filter(Boolean) as string[];

  const permissions = [
    'Microphone: used for voice commands',
    'Camera: used for visual context (optional)',
    settings.locationEnabled ? 'Location: used for context (optional)' : 'Location: disabled',
  ];

  const recommendations: string[] = [];
  if (settings.conversationRetentionDays > 30) {
    recommendations.push(`Reduce conversation retention from ${settings.conversationRetentionDays} to 30 days.`);
  }
  if (settings.analyticsEnabled) {
    recommendations.push('Consider disabling analytics to minimize data sharing.');
  }
  if (settings.shareWithThirdParties) {
    recommendations.push('Disable third-party data sharing for maximum privacy.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Your privacy settings look good!');
  }

  return { dataStored, dataSentToCloud, permissions, recommendations };
}

// ─── Auto data cleanup ────────────────────────────────────────────────────────
export async function runAutoCleanup(): Promise<{ deleted: number }> {
  const settings = await getPrivacySettings();
  if (settings.autoDeleteAfterDays <= 0) return { deleted: 0 };

  const cutoffDate = new Date(Date.now() - settings.autoDeleteAfterDays * 86400000).toISOString().slice(0, 10);
  const deleted = await deleteConversationsBefore(cutoffDate);
  return { deleted };
}
