import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Switch,
  ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useZonStore } from '@/store';
import { COLORS, AI_PROVIDERS, PERSONA_LABELS, type AIProvider } from '@/constants';
import { watchCalendarForReminders } from '@/services/integrations/proactive';
import { getTriggers, saveTrigger, deleteTrigger, makeTriggerId } from '@/services/triggers';
import type { Trigger } from '@/services/triggers';
import type { Persona } from '@/store';

// ─── Small helpers ─────────────────────────────────────────────────────────────
const Section = ({ title }: { title: string }) => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

const RowToggle = ({ label, value, onValueChange, hint }: {
  label: string; value: boolean; onValueChange: (v: boolean) => void; hint?: string;
}) => (
  <View style={styles.row}>
    <View style={styles.rowToggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value} onValueChange={onValueChange}
        trackColor={{ false: COLORS.border, true: COLORS.accent }}
        thumbColor={value ? '#fff' : COLORS.textMuted}
      />
    </View>
  </View>
);

const RowInput = ({ label, value, onChangeText, placeholder, secureTextEntry, hint }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; secureTextEntry?: boolean; hint?: string;
}) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <TextInput
      style={styles.input} value={value} onChangeText={onChangeText}
      placeholder={placeholder ?? ''} placeholderTextColor={COLORS.textDim}
      secureTextEntry={secureTextEntry} autoCapitalize="none" autoCorrect={false}
    />
    {hint && <Text style={styles.hint}>{hint}</Text>}
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { settings, updateSettings, updateApiKey } = useZonStore();

  const [wakeWord, setWakeWord] = useState(settings.wakeWord);
  const [stopWord, setStopWord] = useState(settings.stopWord);
  const [wifiUrl, setWifiUrl] = useState(settings.camera.wifiUrl ?? '');
  const [porcupineKey, setPorcupineKey] = useState(settings.porcupineKey ?? '');
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [newPhrase, setNewPhrase] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const apiProviders: Array<{ id: AIProvider; field: keyof typeof settings.apiKeys }> = [
    { id: 'claude', field: 'anthropic' },
    { id: 'openai', field: 'openai' },
    { id: 'gemini', field: 'gemini' },
    { id: 'grok', field: 'grok' },
  ];

  useEffect(() => {
    getTriggers().then(setTriggers);
  }, []);

  const saveWords = () => {
    updateSettings({
      wakeWord: wakeWord.trim() || 'היי זון',
      stopWord: stopWord.trim() || 'עצור',
      porcupineKey: porcupineKey.trim(),
    });
    Alert.alert('נשמר ✓');
  };

  const addTrigger = async () => {
    if (!newPhrase.trim() || !newPrompt.trim()) return;
    const trigger: Trigger = {
      id: makeTriggerId(),
      phrase: newPhrase.trim(),
      action: { type: 'ai_query', prompt: newPrompt.trim() },
    };
    await saveTrigger(trigger);
    setTriggers(await getTriggers());
    setNewPhrase('');
    setNewPrompt('');
  };

  const removeTrigger = async (id: string) => {
    await deleteTrigger(id);
    setTriggers(await getTriggers());
  };

  const personas: Persona[] = ['auto', 'business', 'quick', 'creative', 'learning'];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>הגדרות</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Wake Words ── */}
        <Section title="מילות הפעלה" />
        <RowInput label="Wake word" value={wakeWord} onChangeText={setWakeWord}
          placeholder="היי זון" hint="המילה שמפעילה האזנה פעילה" />
        <RowInput label="Stop word" value={stopWord} onChangeText={setStopWord}
          placeholder="עצור" hint="המילה שעוצרת מיד" />
        <RowInput label="Picovoice Access Key" value={porcupineKey} onChangeText={setPorcupineKey}
          placeholder="picovoice access key" secureTextEntry
          hint="אופציונלי — Wake word מקומי מהיר (picovoice.ai/console)" />
        <TouchableOpacity style={styles.btn} onPress={saveWords}>
          <Text style={styles.btnText}>שמור מילות הפעלה</Text>
        </TouchableOpacity>

        {/* ── AI Settings ── */}
        <Section title="בינה מלאכותית" />
        <RowToggle label="ניתוב חכם" value={settings.smartRoute}
          onValueChange={(v) => updateSettings({ smartRoute: v })}
          hint="בחירת AI אוטומטית לפי סוג השאלה" />
        <RowToggle label="מצב Race — הכי מהיר מנצח" value={settings.raceMode}
          onValueChange={(v) => updateSettings({ raceMode: v })}
          hint="שולח לכל ה-AIs בו זמנית, הראשון עונה מנצח" />

        {/* Persona */}
        <Text style={styles.rowLabel}>פרסונה</Text>
        <View style={styles.chipRow}>
          {personas.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, settings.persona === p && styles.chipActive]}
              onPress={() => updateSettings({ persona: p })}
            >
              <Text style={[styles.chipText, settings.persona === p && styles.chipTextActive]}>
                {PERSONA_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── API Keys ── */}
        <Section title="מפתחות API" />
        {apiProviders.map(({ id, field }) => (
          <RowInput
            key={id}
            label={AI_PROVIDERS[id].name}
            value={settings.apiKeys[field]}
            onChangeText={(v) => updateApiKey(field, v)}
            placeholder={`${AI_PROVIDERS[id].name} API key`}
            secureTextEntry
          />
        ))}
        <RowInput label="ElevenLabs" value={settings.apiKeys.elevenlabs}
          onChangeText={(v) => updateApiKey('elevenlabs', v)}
          placeholder="ElevenLabs API key" secureTextEntry
          hint="אופציונלי — קול טבעי במקום TTS רגיל" />

        {/* ── TTS ── */}
        <Section title="קול ודיבור" />
        <RowToggle label="תשובות קוליות" value={settings.ttsEnabled}
          onValueChange={(v) => updateSettings({ ttsEnabled: v })} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>ספק קול</Text>
          <View style={styles.chipRow}>
            {(['native', 'elevenlabs'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.chip, settings.ttsProvider === p && styles.chipActive]}
                onPress={() => updateSettings({ ttsProvider: p })}
              >
                <Text style={[styles.chipText, settings.ttsProvider === p && styles.chipTextActive]}>
                  {p === 'native' ? 'מובנה' : 'ElevenLabs'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Camera ── */}
        <Section title="מצלמה" />
        <View style={styles.chipRow}>
          {(['none', 'phone', 'wifi', 'bluetooth'] as const).map((t) => {
            const labels = { none: 'כבוי', phone: 'טלפון', wifi: 'WiFi', bluetooth: 'BT' };
            const active = settings.camera.type === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => updateSettings({ camera: { ...settings.camera, type: t, active: t !== 'none' } })}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{labels[t]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {settings.camera.type === 'wifi' && (
          <>
            <RowInput label="URL מצלמת WiFi" value={wifiUrl} onChangeText={setWifiUrl}
              placeholder="http://192.168.1.100/snapshot"
              hint="URL לתמונת JPEG מהמצלמה" />
            <TouchableOpacity style={styles.btn}
              onPress={() => updateSettings({ camera: { ...settings.camera, wifiUrl } })}>
              <Text style={styles.btnText}>שמור URL</Text>
            </TouchableOpacity>
          </>
        )}
        <RowToggle label="ניתוח סצנה פסיבי (כל 3 שניות)" value={settings.sceneMonitor}
          onValueChange={(v) => updateSettings({ sceneMonitor: v })}
          hint="Gemini Flash מתאר את הסביבה ברציפות" />

        {/* ── Proactive ── */}
        <Section title="יוזמה — Proactive" />
        <RowToggle label="בריפינג בוקר"
          value={settings.proactive.morningBriefing}
          onValueChange={(v) => {
            updateSettings({ proactive: { ...settings.proactive, morningBriefing: v } });
            if (v) watchCalendarForReminders().catch(() => {});
          }}
          hint={`מסכם את היום ב-${settings.proactive.morningHour}:00`} />
        <RowToggle label="סיכום ערב"
          value={settings.proactive.eveningBriefing}
          onValueChange={(v) => updateSettings({ proactive: { ...settings.proactive, eveningBriefing: v } })}
          hint={`סיכום יומי ב-${settings.proactive.eveningHour}:00`} />
        <RowToggle label="תזכורות יומן"
          value={settings.proactive.calendarReminders}
          onValueChange={(v) => updateSettings({ proactive: { ...settings.proactive, calendarReminders: v } })} />

        {/* ── Intelligence Features ── */}
        <Section title="תכונות מתקדמות" />
        <RowToggle
          label="כרוניקה (יומן חיים)"
          value={settings.chronicleEnabled}
          onValueChange={(v) => updateSettings({ chronicleEnabled: v })}
          hint="מעקב שיחות, אנשים ומיומנויות — יומן יום-יומי אוטומטי"
        />
        <RowToggle
          label="מצב אימון שיחה"
          value={settings.coachingMode}
          onValueChange={(v) => updateSettings({ coachingMode: v })}
          hint="טיפים בזמן אמת על דפוסי שיחה, יחס דיבור ועוד"
        />
        <RowToggle
          label="אינטליגנציה סביבתית"
          value={settings.ambientMode}
          onValueChange={(v) => updateSettings({ ambientMode: v })}
          hint="זיהוי אוטומטי: פגישה / שיחה / נהיגה / שינה"
        />
        <RowToggle
          label="טעינה מוקדמת חכמה (Predictive)"
          value={settings.predictiveMode}
          onValueChange={(v) => updateSettings({ predictiveMode: v })}
          hint="טוען זיכרון ויומן מיד עם זיהוי קול — תגובות מהירות יותר"
        />
        <RowToggle
          label="סוכן מרובה (Multi-Agent)"
          value={settings.multiAgentEnabled}
          onValueChange={(v) => updateSettings({ multiAgentEnabled: v })}
          hint="משימות מורכבות מפוצלות ומבוצעות במקביל"
        />
        <RowToggle
          label="הקשר מרחבי (GPS)"
          value={settings.spatialContext}
          onValueChange={(v) => updateSettings({ spatialContext: v })}
          hint="מציין לAI היכן אתה נמצא לפי אשכולות מיקום מוכרים"
        />

        {/* ── Triggers ── */}
        <Section title="טריגרים מותאמים אישית" />
        <Text style={styles.hint}>כשאתה אומר משפט מסוים, Zon מבצעת פעולה</Text>
        <View style={styles.row}>
          <RowInput label='משפט הפעלה' value={newPhrase} onChangeText={setNewPhrase}
            placeholder='שלח לבוס' />
          <RowInput label='הנחיה ל-AI' value={newPrompt} onChangeText={setNewPrompt}
            placeholder='כתוב אימייל מקצועי ל...' />
          <TouchableOpacity style={[styles.btn, { marginTop: 4 }]} onPress={addTrigger}>
            <Text style={styles.btnText}>+ הוסף טריגר</Text>
          </TouchableOpacity>
        </View>
        {triggers.map((t) => (
          <View key={t.id} style={styles.triggerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.triggerPhrase}>"{t.phrase}"</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {'prompt' in t.action ? t.action.prompt : t.action.type}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeTrigger(t.id)}>
              <Ionicons name="trash-outline" color={COLORS.danger} size={18} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  content: { paddingHorizontal: 16, paddingTop: 8 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    marginTop: 24, marginBottom: 10,
  },

  row: { marginBottom: 12 },
  rowToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, color: COLORS.textMuted, marginBottom: 4 },
  hint: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  input: {
    backgroundColor: COLORS.surface, color: COLORS.text,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },

  btn: {
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: `${COLORS.accent}22`, borderColor: COLORS.accent },
  chipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: COLORS.accent },

  triggerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 8,
    padding: 12, marginBottom: 8,
  },
  triggerPhrase: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
});
