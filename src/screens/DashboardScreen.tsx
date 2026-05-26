import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import StatsCard from '../components/StatsCard';
import { Stats, WhatsAppStatus } from '../types';

interface SchedulerEvent {
  sent?: number;
  failed?: number;
  total?: number;
  business?: string;
  reason?: string;
  message?: string;
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [schedulerLog, setSchedulerLog] = useState<string[]>([]);
  const [nextRun, setNextRun] = useState<string>('');

  const addLog = useCallback((msg: string) => {
    setSchedulerLog((prev) => [`${new Date().toLocaleTimeString('he-IL')}: ${msg}`, ...prev].slice(0, 20));
  }, []);

  useSocket({
    'whatsapp:status': (data: unknown) => {
      const d = data as { status: WhatsAppStatus };
      setWaStatus(d.status);
      if (d.status === 'connected') setQrCode(null);
    },
    'whatsapp:qr': (data: unknown) => {
      const d = data as { qr: string };
      setQrCode(d.qr);
      setWaStatus('qr_ready');
    },
    'scheduler:started': (data: unknown) => {
      const d = data as SchedulerEvent;
      addLog(`שליחה יומית התחילה - ${d.total} עסקים`);
      setRunningNow(true);
    },
    'scheduler:progress': (data: unknown) => {
      const d = data as SchedulerEvent;
      addLog(`נשלח ל-${d.business} (${d.sent}/${d.total})`);
    },
    'scheduler:done': (data: unknown) => {
      const d = data as SchedulerEvent;
      addLog(`שליחה יומית הושלמה - ${d.sent} הצליחו, ${d.failed} נכשלו`);
      setRunningNow(false);
      loadStats();
    },
    'scheduler:skipped': (data: unknown) => {
      const d = data as SchedulerEvent;
      addLog(`דלג: ${d.reason}`);
    },
    'message:new': () => loadStats(),
    'message:sent': () => loadStats(),
  });

  const loadStats = useCallback(async () => {
    try {
      const [statsData, settings] = await Promise.all([
        api.getBusinessStats(),
        api.getSettings(),
      ]);
      setStats(statsData);
      setWaStatus(settings.whatsapp_status as WhatsAppStatus);
      if (settings.next_run) {
        const d = new Date(settings.next_run);
        setNextRun(d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {
      // backend not running yet
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const handleRunNow = useCallback(async () => {
    Alert.alert(
      'הפעל שליחה עכשיו',
      'לשלוח הודעות ל-10 עסקים עכשיו?',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'שלח',
          style: 'default',
          onPress: async () => {
            setRunningNow(true);
            addLog('מתחיל שליחה ידנית...');
            try {
              const result = await api.runNow();
              addLog(`הושלם: ${result.sent} נשלחו, ${result.failed} נכשלו`);
              loadStats();
            } catch (err) {
              addLog('שגיאה בשליחה');
            } finally {
              setRunningNow(false);
            }
          },
        },
      ]
    );
  }, [addLog, loadStats]);

  const waStatusConfig: Record<WhatsAppStatus, { color: string; label: string; emoji: string }> = {
    connected: { color: Colors.primary, label: 'מחובר', emoji: '✅' },
    qr_ready: { color: Colors.warning, label: 'סרוק QR', emoji: '📷' },
    authenticated: { color: Colors.gemini, label: 'מאומת', emoji: '🔐' },
    disconnected: { color: Colors.danger, label: 'מנותק', emoji: '❌' },
    error: { color: Colors.danger, label: 'שגיאה', emoji: '⚠️' },
  };

  const waConfig = waStatusConfig[waStatus] || waStatusConfig.disconnected;
  const responseRate = stats && stats.contacted > 0
    ? Math.round((stats.responded / stats.contacted) * 100)
    : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>YourZon</Text>
          <Text style={styles.subtitle}>לוח בקרה - WhatsApp AI</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: waConfig.color + '20', borderColor: waConfig.color + '60' }]}>
          <Text style={styles.statusEmoji}>{waConfig.emoji}</Text>
          <Text style={[styles.statusLabel, { color: waConfig.color }]}>{waConfig.label}</Text>
        </View>
      </View>

      {waStatus === 'qr_ready' && qrCode && (
        <View style={styles.qrCard}>
          <Text style={styles.qrTitle}>📱 סרוק את ה-QR עם WhatsApp</Text>
          <Text style={styles.qrInstructions}>
            פתח WhatsApp → הגדרות → מכשירים מקושרים → קשר מכשיר
          </Text>
        </View>
      )}

      {stats && (
        <>
          <Text style={styles.sectionTitle}>סטטיסטיקות</Text>
          <View style={styles.statsRow}>
            <StatsCard title="נשלח היום" value={stats.sentToday} color={Colors.primary} icon="📤" />
            <View style={styles.gap} />
            <StatsCard title="תגובות" value={stats.responded} color={Colors.gemini} icon="💬" />
          </View>
          <View style={[styles.statsRow, styles.statsRowMargin]}>
            <StatsCard
              title="אחוז תגובה"
              value={`${responseRate}%`}
              color={responseRate > 20 ? Colors.success : Colors.warning}
              subtitle={`${stats.contacted} פנייות`}
            />
            <View style={styles.gap} />
            <StatsCard title="המרות" value={stats.converted} color={Colors.claude} icon="🏆" />
          </View>
          <View style={[styles.statsRow, styles.statsRowMargin]}>
            <StatsCard title="סה״כ נשלח" value={stats.totalSent} color={Colors.accent} />
            <View style={styles.gap} />
            <StatsCard title="ממתינים" value={stats.pending} color={Colors.textSecondary} />
          </View>
        </>
      )}

      <View style={styles.actionCard}>
        <View style={styles.actionHeader}>
          <Text style={styles.actionTitle}>אוטומציה יומית</Text>
          {nextRun ? <Text style={styles.nextRun}>פעולה הבאה: {nextRun}</Text> : null}
        </View>
        <Text style={styles.actionDesc}>שולח 10 הודעות מותאמות אישית ביום עם Gemini AI</Text>
        <TouchableOpacity
          style={[styles.runBtn, runningNow && styles.runBtnDisabled]}
          onPress={handleRunNow}
          disabled={runningNow}
          activeOpacity={0.8}
        >
          {runningNow ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.runBtnText}>הפעל עכשיו</Text>
          )}
        </TouchableOpacity>
      </View>

      {schedulerLog.length > 0 && (
        <View style={styles.logCard}>
          <Text style={styles.logTitle}>יומן פעילות</Text>
          {schedulerLog.map((log, i) => (
            <Text key={i} style={styles.logEntry}>{log}</Text>
          ))}
        </View>
      )}

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>מנועי AI פעילים</Text>
        <View style={styles.aiRow}>
          <View style={[styles.aiChip, { borderColor: Colors.gemini + '60', backgroundColor: Colors.geminiGlow }]}>
            <Text style={[styles.aiChipText, { color: Colors.gemini }]}>Gemini — פנייות יוצאות</Text>
          </View>
          <View style={[styles.aiChip, { borderColor: Colors.claude + '60', backgroundColor: Colors.claudeGlow }]}>
            <Text style={[styles.aiChipText, { color: Colors.claude }]}>Claude — תגובות אוטומטיות</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingTop: 8,
  },
  title: { color: Colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  statusEmoji: { fontSize: 14 },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  qrCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    alignItems: 'center',
  },
  qrTitle: { color: Colors.warning, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  qrInstructions: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center' },
  sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  statsRow: { flexDirection: 'row' },
  statsRowMargin: { marginTop: 8 },
  gap: { width: 8 },
  actionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.primaryDark + '40',
  },
  actionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  actionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  nextRun: { color: Colors.primary, fontSize: 12 },
  actionDesc: { color: Colors.textSecondary, fontSize: 13, marginBottom: 14 },
  runBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  runBtnDisabled: { opacity: 0.6 },
  runBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  logCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  logTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  logEntry: { color: Colors.textMuted, fontSize: 11, marginBottom: 4, fontFamily: 'monospace' },
  aiCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  aiTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  aiRow: { gap: 8 },
  aiChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiChipText: { fontSize: 13, fontWeight: '500' },
});
