import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { Settings } from '../types';
import { useSocket } from '../hooks/useSocket';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [waStatus, setWaStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, wa] = await Promise.all([
        api.getSettings(),
        api.getWhatsAppStatus(),
      ]);
      setSettings(s);
      setWaStatus(wa.status);
    } catch {
      // ignore
    }
  }, []);

  useSocket({
    'whatsapp:status': (data: unknown) => {
      const d = data as { status: string };
      setWaStatus(d.status);
      if (settings) setSettings((prev) => prev ? { ...prev, whatsapp_status: d.status as Settings['whatsapp_status'] } : prev);
    },
  });

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (updates: Partial<Settings>) => {
    setSaving(true);
    try {
      await api.updateSettings(updates);
      setSettings((prev) => prev ? { ...prev, ...updates } : prev);
      Alert.alert('נשמר', 'ההגדרות עודכנו בהצלחה');
    } catch (err) {
      Alert.alert('שגיאה', String(err));
    } finally {
      setSaving(false);
    }
  }, []);

  const saveApiKeys = useCallback(async () => {
    if (!geminiKey && !claudeKey) {
      Alert.alert('שגיאה', 'יש להזין לפחות מפתח API אחד');
      return;
    }
    setSaving(true);
    try {
      await api.saveApiKeys({
        gemini_api_key: geminiKey || undefined,
        claude_api_key: claudeKey || undefined,
      });
      setGeminiKey('');
      setClaudeKey('');
      Alert.alert('נשמר', 'מפתחות API עודכנו בהצלחה');
    } catch (err) {
      Alert.alert('שגיאה', String(err));
    } finally {
      setSaving(false);
    }
  }, [geminiKey, claudeKey]);

  const handleDisconnect = useCallback(() => {
    Alert.alert('התנתק מ-WhatsApp', 'להתנתק מהחשבון?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתק', style: 'destructive',
        onPress: async () => {
          await api.disconnectWhatsApp();
        },
      },
    ]);
  }, []);

  if (!settings) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>טוען הגדרות...</Text>
      </View>
    );
  }

  const waStatusConfig = {
    connected: { label: 'מחובר', color: Colors.primary, emoji: '✅' },
    qr_ready: { label: 'ממתין לסריקה', color: Colors.warning, emoji: '📷' },
    authenticated: { label: 'מאומת', color: Colors.gemini, emoji: '🔐' },
    disconnected: { label: 'מנותק', color: Colors.danger, emoji: '❌' },
    error: { label: 'שגיאה', color: Colors.danger, emoji: '⚠️' },
  };
  const waCfg = waStatusConfig[waStatus as keyof typeof waStatusConfig] || waStatusConfig.disconnected;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>הגדרות</Text>

      {/* WhatsApp Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WhatsApp</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>סטטוס חיבור</Text>
            <View style={[styles.statusBadge, { backgroundColor: waCfg.color + '20' }]}>
              <Text style={styles.statusEmoji}>{waCfg.emoji}</Text>
              <Text style={[styles.statusText, { color: waCfg.color }]}>{waCfg.label}</Text>
            </View>
          </View>
          {waStatus === 'connected' && (
            <TouchableOpacity style={styles.dangerBtn} onPress={handleDisconnect}>
              <Text style={styles.dangerBtnText}>התנתק</Text>
            </TouchableOpacity>
          )}
          {waStatus === 'disconnected' && (
            <Text style={styles.hint}>הפעל את הבאקנד כדי להתחבר ולסרוק QR</Text>
          )}
        </View>
      </View>

      {/* Automation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>אוטומציה יומית</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>שעת שליחה</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={styles.timeInput}
                value={settings.daily_send_minute}
                onChangeText={(v) => setSettings((p) => p ? { ...p, daily_send_minute: v } : p)}
                keyboardType="numeric"
                maxLength={2}
                placeholder="00"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
              />
              <Text style={styles.timeSep}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={settings.daily_send_hour}
                onChangeText={(v) => setSettings((p) => p ? { ...p, daily_send_hour: v } : p)}
                keyboardType="numeric"
                maxLength={2}
                placeholder="09"
                placeholderTextColor={Colors.textMuted}
                textAlign="center"
              />
            </View>
          </View>

          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.label}>הודעות ביום</Text>
            <View style={styles.counterRow}>
              {['5', '10', '15', '20'].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.counterBtn, settings.messages_per_day === n && styles.counterBtnActive]}
                  onPress={() => setSettings((p) => p ? { ...p, messages_per_day: n } : p)}
                >
                  <Text style={[styles.counterBtnText, settings.messages_per_day === n && styles.counterBtnTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.label}>תגובה אוטומטית</Text>
            <Switch
              value={settings.auto_reply === 'true'}
              onValueChange={(v) => setSettings((p) => p ? { ...p, auto_reply: v ? 'true' : 'false' } : p)}
              trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => save({
              daily_send_hour: settings.daily_send_hour,
              daily_send_minute: settings.daily_send_minute,
              messages_per_day: settings.messages_per_day,
              auto_reply: settings.auto_reply,
            })}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.saveBtnText}>שמור הגדרות</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* AI API Keys */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>מפתחות AI</Text>
        <View style={styles.card}>
          <View style={[styles.aiHeader, { backgroundColor: Colors.geminiGlow, borderColor: Colors.gemini + '40' }]}>
            <Text style={[styles.aiLabel, { color: Colors.gemini }]}>Google Gemini API Key</Text>
            <Text style={styles.aiRole}>פנייות יוצאות</Text>
          </View>
          <TextInput
            style={styles.apiInput}
            value={geminiKey}
            onChangeText={setGeminiKey}
            placeholder="AIza..."
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />

          <View style={[styles.aiHeader, styles.aiHeaderMargin, { backgroundColor: Colors.claudeGlow, borderColor: Colors.claude + '40' }]}>
            <Text style={[styles.aiLabel, { color: Colors.claude }]}>Anthropic Claude API Key</Text>
            <Text style={styles.aiRole}>תגובות אוטומטיות</Text>
          </View>
          <TextInput
            style={styles.apiInput}
            value={claudeKey}
            onChangeText={setClaudeKey}
            placeholder="sk-ant-..."
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={saveApiKeys}
            disabled={saving || (!geminiKey && !claudeKey)}
          >
            <Text style={styles.saveBtnText}>שמור מפתחות API</Text>
          </TouchableOpacity>

          <Text style={styles.apiNote}>
            המפתחות נשמרים בזיכרון הסשן בלבד ולא נכתבים לדיסק
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>סטטיסטיקות כלליות</Text>
        <View style={styles.card}>
          {[
            { label: 'סה"כ הודעות שנשלחו', value: settings.total_sent },
            { label: 'סה"כ תגובות התקבלו', value: settings.total_responses },
            { label: 'שליחה הבאה', value: new Date(settings.next_run).toLocaleString('he-IL') },
          ].map((item, i) => (
            <View key={i} style={[styles.statRow, i > 0 && styles.rowBorder]}>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.label}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, gap: 16 },
  loadingText: { color: Colors.textSecondary },
  pageTitle: { color: Colors.text, fontSize: 22, fontWeight: '800', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'right',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.cardBorder, marginTop: 10, paddingTop: 16 },
  label: { color: Colors.textSecondary, fontSize: 14 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusEmoji: { fontSize: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  dangerBtn: {
    backgroundColor: Colors.danger + '20',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
  },
  dangerBtnText: { color: Colors.danger, fontSize: 14, fontWeight: '600' },
  hint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    width: 48,
    paddingVertical: 8,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  timeSep: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  counterRow: { flexDirection: 'row', gap: 8 },
  counterBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  counterBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  counterBtnText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  counterBtnTextActive: { color: Colors.primary },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  aiHeaderMargin: { marginTop: 12 },
  aiLabel: { fontSize: 12, fontWeight: '600' },
  aiRole: { color: Colors.textMuted, fontSize: 11 },
  apiInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    fontFamily: 'monospace',
  },
  apiNote: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
});
