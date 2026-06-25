import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useZonStore } from '@/store';
import { COLORS, AI_PROVIDERS, type AIProvider } from '@/constants';

function Section({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function RowInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor={COLORS.textDim}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function RowToggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.row, styles.rowToggle]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.border, true: COLORS.accent }}
        thumbColor={value ? '#fff' : COLORS.textMuted}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, updateApiKey } = useZonStore();
  const [wakeWord, setWakeWord] = useState(settings.wakeWord);
  const [stopWord, setStopWord] = useState(settings.stopWord);
  const [wifiUrl, setWifiUrl] = useState(settings.camera.wifiUrl ?? '');

  const saveWords = () => {
    updateSettings({ wakeWord: wakeWord.trim() || 'היי זון', stopWord: stopWord.trim() || 'עצור' });
    Alert.alert('נשמר', 'מילות ההפעלה עודכנו');
  };

  const aiProviders: AIProvider[] = ['claude', 'openai', 'gemini', 'grok'];
  const apiKeyFields: Record<AIProvider, keyof typeof settings.apiKeys> = {
    claude: 'anthropic',
    openai: 'openai',
    gemini: 'gemini',
    grok: 'grok',
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>הגדרות</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Wake words */}
        <Section title="מילות הפעלה" />
        <RowInput
          label="Wake word"
          value={wakeWord}
          onChangeText={setWakeWord}
          placeholder="היי זון"
          hint="המילה שמפעילה את ההאזנה"
        />
        <RowInput
          label="Stop word"
          value={stopWord}
          onChangeText={setStopWord}
          placeholder="עצור"
          hint="המילה שעוצרת"
        />
        <TouchableOpacity style={styles.saveBtn} onPress={saveWords}>
          <Text style={styles.saveBtnText}>שמור מילות הפעלה</Text>
        </TouchableOpacity>

        {/* AI Settings */}
        <Section title="בינה מלאכותית" />
        <RowToggle
          label="ניתוב חכם אוטומטי"
          value={settings.smartRoute}
          onValueChange={(v) => updateSettings({ smartRoute: v })}
        />

        {/* Provider buttons */}
        <View style={styles.providerRow}>
          {aiProviders.map((p) => {
            const isSelected = settings.preferredProvider === p;
            const info = AI_PROVIDERS[p];
            return (
              <TouchableOpacity
                key={p}
                style={[
                  styles.providerBtn,
                  { borderColor: info.color },
                  isSelected && { backgroundColor: `${info.color}22` },
                ]}
                onPress={() =>
                  updateSettings({
                    preferredProvider: settings.smartRoute ? 'auto' : p,
                  })
                }
              >
                <Text style={[styles.providerBtnText, { color: info.color }]}>
                  {info.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* API Keys */}
        <Section title="מפתחות API" />
        {aiProviders.map((p) => {
          const info = AI_PROVIDERS[p];
          const field = apiKeyFields[p];
          return (
            <RowInput
              key={p}
              label={info.name}
              value={settings.apiKeys[field]}
              onChangeText={(v) => updateApiKey(field, v)}
              placeholder={`${info.name} API key`}
              secureTextEntry
            />
          );
        })}

        {/* TTS */}
        <Section title="קול ודיבור" />
        <RowToggle
          label="תשובות קוליות (TTS)"
          value={settings.ttsEnabled}
          onValueChange={(v) => updateSettings({ ttsEnabled: v })}
        />

        {/* Camera */}
        <Section title="מצלמה" />
        <View style={styles.cameraTypeRow}>
          {(['none', 'phone', 'wifi', 'bluetooth'] as const).map((t) => {
            const labels: Record<string, string> = {
              none: 'כבוי',
              phone: 'טלפון',
              wifi: 'WiFi',
              bluetooth: 'BT',
            };
            const isActive = settings.camera.type === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.cameraTypeBtn, isActive && styles.cameraTypeBtnActive]}
                onPress={() =>
                  updateSettings({ camera: { ...settings.camera, type: t, active: t !== 'none' } })
                }
              >
                <Text style={[styles.cameraTypeBtnText, isActive && styles.cameraTypeBtnTextActive]}>
                  {labels[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {settings.camera.type === 'wifi' && (
          <View>
            <RowInput
              label="כתובת מצלמת WiFi"
              value={wifiUrl}
              onChangeText={setWifiUrl}
              placeholder="http://192.168.1.100/snapshot"
              hint="URL לצילום תמונה מהמצלמה"
            />
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() =>
                updateSettings({ camera: { ...settings.camera, wifiUrl } })
              }
            >
              <Text style={styles.saveBtnText}>שמור URL מצלמה</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  content: { paddingHorizontal: 16, paddingTop: 8 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },

  row: {
    marginBottom: 12,
  },
  rowToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  hint: {
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 3,
    marginLeft: 2,
  },

  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  providerBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  providerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  cameraTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cameraTypeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cameraTypeBtnActive: {
    backgroundColor: `${COLORS.accent}22`,
    borderColor: COLORS.accent,
  },
  cameraTypeBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  cameraTypeBtnTextActive: {
    color: COLORS.accent,
  },
});
