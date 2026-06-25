import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import {
  getTodayStats, getTodayTimeline, getKnownPlaces, saveCurrentLocationAsPlace,
  startLifeTracking, stopLifeTracking, isLifeTrackingActive, saveDailySummary,
  type DailyStats, type LocationPoint, type ActivityType,
} from '@/services/lifetracker';
import {
  getTodaySegments, getPassiveDayStats,
  type PassiveSegment, type PassiveDayStats,
} from '@/services/passive';
import { routeToAIStream } from '@/services/ai/router';
import { consumeStream } from '@/services/ai/streaming';
import { useZonStore } from '@/store';
import { COLORS } from '@/constants';

type Tab = 'today' | 'conversations' | 'places';

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  stationary: 'pause-circle-outline',
  walking: 'walk-outline',
  running: 'fitness-outline',
  cycling: 'bicycle-outline',
  driving: 'car-outline',
  unknown: 'radio-button-off-outline',
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  stationary: 'עמדת',
  walking: 'הלכת',
  running: 'רצת',
  cycling: 'רכבת',
  driving: 'נסעת',
  unknown: '',
};

const SESSION_LABELS: Record<string, string> = {
  conversation: 'שיחה',
  lecture: 'שיעור',
  meeting: 'פגישה',
  phone_call: 'שיחת טלפון',
  ambient: 'סביבה',
  solo: 'מחשבות',
};

export default function LifeViewScreen() {
  const { settings } = useZonStore((s) => ({ settings: s.settings }));
  const [tab, setTab] = useState<Tab>('today');
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [timeline, setTimeline] = useState<LocationPoint[]>([]);
  const [segments, setSegments] = useState<PassiveSegment[]>([]);
  const [passiveStats, setPassiveStats] = useState<PassiveDayStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [trackingActive, setTrackingActive] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<PassiveSegment | null>(null);

  const load = useCallback(async () => {
    const [s, tl, segs, pStats, tracking] = await Promise.all([
      getTodayStats(),
      getTodayTimeline(),
      getTodaySegments(),
      getPassiveDayStats(),
      isLifeTrackingActive(),
    ]);
    setStats(s);
    setTimeline(tl);
    setSegments(segs);
    setPassiveStats(pStats);
    setTrackingActive(tracking);
    if (s.summary) setAiSummary(s.summary);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleTracking = async () => {
    if (trackingActive) {
      await stopLifeTracking();
      setTrackingActive(false);
    } else {
      const ok = await startLifeTracking();
      setTrackingActive(ok);
      if (!ok) Alert.alert('נדרשת הרשאה', 'אפשר גישה למיקום ברקע בהגדרות האפליקציה');
    }
  };

  const generateDaySummary = async () => {
    setSummarizing(true);
    try {
      const parts: string[] = [];

      if (stats) {
        parts.push(`סטטיסטיקות היום: ${stats.steps} צעדים, ${stats.calories} קלוריות, ${(stats.distanceM / 1000).toFixed(1)} ק"מ`);
        if (stats.places.length > 0) {
          parts.push(`מקומות: ${stats.places.map((p) => `${p.name} (${p.durationMin} דקות)`).join(', ')}`);
        }
      }

      if (segments.length > 0) {
        const allText = segments.slice(0, 10).map((s) => `[${format(new Date(s.createdAt), 'HH:mm')}] ${s.text.slice(0, 200)}`).join('\n');
        parts.push(`שיחות היום:\n${allText}`);
      }

      const prompt = `אתה מסכם את היום של המשתמש בעברית.
בהתבסס על הנתונים הבאים, צור סיכום יומי קצר ומעניין (4-6 משפטים) שכולל:
- מה עשה המשתמש היום
- עם מי שוחח
- כמה זז ונע
- תובנה אחת מעניינת מהיום

נתונים:
${parts.join('\n\n')}`;

      const { stream } = await routeToAIStream(prompt, [], settings, undefined);
      let full = '';
      await consumeStream(stream, (text) => setAiSummary(text), async () => {}, async (f) => { full = f; });
      setAiSummary(full);
      await saveDailySummary(full);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message ?? 'לא הצליח ליצור סיכום');
    } finally {
      setSummarizing(false);
    }
  };

  const summarizeSegment = async (seg: PassiveSegment) => {
    setSummaryTarget(seg);
    setSummarizing(true);
    try {
      const prompt = `סכם את השיחה/שיעור הבא בעברית בצורה חכמה. כלול:
- נושאים עיקריים
- נקודות חשובות
- פעולות נדרשות (אם יש)

טקסט:\n${seg.text.slice(0, 3000)}`;

      const { stream } = await routeToAIStream(prompt, [], settings, undefined);
      let full = '';
      await consumeStream(stream, () => {}, async () => {}, async (f) => { full = f; });

      const { saveSegmentSummary } = await import('@/services/passive');
      await saveSegmentSummary(seg.id, full);
      await load();
      Alert.alert('סיכום', full, [{ text: 'סגור' }]);
    } catch {}
    finally { setSummarizing(false); setSummaryTarget(null); }
  };

  const savePlace = async () => {
    Alert.prompt(
      'שמור מיקום',
      'שם המקום (בית, עבודה, חדר כושר...)',
      async (name) => {
        if (!name?.trim()) return;
        const ok = await saveCurrentLocationAsPlace(name.trim());
        if (ok) Alert.alert('נשמר ✓', `${name} נשמר כמקום מוכר`);
        else Alert.alert('שגיאה', 'לא הצליח לקבל מיקום');
      },
      'plain-text'
    );
  };

  // Build a simplified movement timeline from location points
  const buildMovementTimeline = () => {
    if (timeline.length === 0) return [];
    const events: Array<{ time: string; activity: ActivityType; place: string | null; lat: number; lon: number }> = [];
    let lastActivity: ActivityType | null = null;
    let lastPlace: string | null = null;

    for (const pt of timeline) {
      if (pt.activity !== lastActivity || pt.placeName !== lastPlace) {
        events.push({
          time: format(new Date(pt.createdAt), 'HH:mm'),
          activity: pt.activity,
          place: pt.placeName,
          lat: pt.lat,
          lon: pt.lon,
        });
        lastActivity = pt.activity;
        lastPlace = pt.placeName;
      }
    }
    return events.slice(0, 40);
  };

  const movementEvents = buildMovementTimeline();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>היום שלי</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={toggleTracking} style={[styles.trackBtn, trackingActive && styles.trackBtnActive]}>
            <Ionicons name={trackingActive ? 'radio' : 'radio-outline'} color={trackingActive ? COLORS.success : COLORS.textMuted} size={18} />
            <Text style={[styles.trackBtnText, trackingActive && { color: COLORS.success }]}>
              {trackingActive ? 'עוקב' : 'כבוי'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={savePlace} style={styles.iconBtn}>
            <Ionicons name="add-circle-outline" color={COLORS.accent} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats strip */}
      {stats && (
        <View style={styles.statsRow}>
          <StatCell icon="footsteps-outline" value={stats.steps.toLocaleString()} label="צעדים" color={COLORS.accent} />
          <View style={styles.statDivider} />
          <StatCell icon="flame-outline" value={String(stats.calories)} label="קלוריות" color={COLORS.warning} />
          <View style={styles.statDivider} />
          <StatCell icon="navigate-outline" value={`${(stats.distanceM / 1000).toFixed(1)}`} label='ק"מ' color={COLORS.success} />
          <View style={styles.statDivider} />
          <StatCell icon="time-outline" value={String(stats.activeMin)} label='דק׳ פעיל' color={COLORS.textMuted} />
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['today', 'conversations', 'places'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { today: 'מסלול', conversations: 'שיחות', places: 'מקומות' };
          const icons: Record<Tab, string> = { today: 'map-outline', conversations: 'mic-outline', places: 'location-outline' };
          return (
            <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
              <Ionicons name={icons[t] as any} color={tab === t ? COLORS.accent : COLORS.textMuted} size={15} />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{labels[t]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Today / Route tab */}
        {tab === 'today' && (
          <>
            {/* AI day summary */}
            {aiSummary ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Ionicons name="sparkles" color={COLORS.accent} size={15} />
                  <Text style={styles.summaryTitle}>סיכום יומי</Text>
                  <TouchableOpacity onPress={generateDaySummary} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="refresh-outline" color={COLORS.textDim} size={14} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.summaryText}>{aiSummary}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.generateBtn} onPress={generateDaySummary} disabled={summarizing}>
                {summarizing ? (
                  <ActivityIndicator color={COLORS.accent} size="small" />
                ) : (
                  <Ionicons name="sparkles-outline" color={COLORS.accent} size={18} />
                )}
                <Text style={styles.generateBtnText}>
                  {summarizing ? 'מסכם את היום...' : 'סכם את היום שלי'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Movement timeline */}
            {movementEvents.length === 0 ? (
              <EmptyState icon="map-outline" text="אין מסלול להיום" hint="הפעל מעקב מיקום כדי לראות לאן הלכת" />
            ) : (
              <>
                <Text style={styles.sectionLabel}>מסלול היום</Text>
                <View style={styles.timeline}>
                  {movementEvents.map((ev, i) => (
                    <View key={i} style={styles.timelineRow}>
                      <View style={styles.timelineLeft}>
                        <Text style={styles.timelineTime}>{ev.time}</Text>
                        {i < movementEvents.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={[styles.timelineDot, { backgroundColor: ev.place ? COLORS.accent : COLORS.border }]}>
                        <Ionicons name={ACTIVITY_ICONS[ev.activity] as any} color={ev.place ? '#fff' : COLORS.textDim} size={12} />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineActivity}>{ACTIVITY_LABELS[ev.activity] || ev.activity}</Text>
                        {ev.place && <Text style={styles.timelinePlace}>{ev.place}</Text>}
                        {!ev.place && (
                          <Text style={styles.timelineCoords}>
                            {ev.lat.toFixed(4)}, {ev.lon.toFixed(4)}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Places visited today */}
            {stats && stats.places.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>מקומות שביקרת</Text>
                {stats.places.map((p, i) => (
                  <View key={i} style={styles.placeCard}>
                    <Ionicons name="location" color={COLORS.accent} size={16} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.placeName}>{p.name}</Text>
                      <Text style={styles.placeMeta}>
                        {format(new Date(p.arrivedAt), 'HH:mm')} — {p.leftAt ? format(new Date(p.leftAt), 'HH:mm') : 'עדיין כאן'} · {p.durationMin} דקות
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* Conversations tab */}
        {tab === 'conversations' && (
          <>
            {passiveStats && passiveStats.totalSegments > 0 && (
              <View style={styles.passiveStatsRow}>
                <Text style={styles.passiveStatItem}>{passiveStats.totalSegments} שיחות</Text>
                <Text style={styles.passiveDot}>·</Text>
                <Text style={styles.passiveStatItem}>{passiveStats.uniquePeople.length} אנשים</Text>
                <Text style={styles.passiveDot}>·</Text>
                <Text style={styles.passiveStatItem}>{passiveStats.totalWordCount.toLocaleString()} מילים</Text>
              </View>
            )}

            {segments.length === 0 ? (
              <EmptyState icon="mic-outline" text="אין הקלטות להיום" hint="הפעל מצב האזנה פסיבי כדי להקליט שיחות, שיעורים ופגישות" />
            ) : (
              segments.map((seg) => (
                <View key={seg.id} style={styles.segCard}>
                  <View style={styles.segHeader}>
                    <View style={styles.segTypeBadge}>
                      <Text style={styles.segTypeText}>{SESSION_LABELS[seg.sessionType] ?? seg.sessionType}</Text>
                    </View>
                    <Text style={styles.segTime}>{format(new Date(seg.createdAt), 'HH:mm')}</Text>
                    {seg.locationLabel && (
                      <Text style={styles.segLocation}> · {seg.locationLabel}</Text>
                    )}
                    <TouchableOpacity
                      style={styles.segSumBtn}
                      onPress={() => summarizeSegment(seg)}
                      disabled={summarizing && summaryTarget?.id === seg.id}
                    >
                      {summarizing && summaryTarget?.id === seg.id ? (
                        <ActivityIndicator size="small" color={COLORS.accent} />
                      ) : (
                        <Ionicons name="sparkles-outline" color={COLORS.accent} size={14} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {seg.summary ? (
                    <Text style={styles.segSummary}>{seg.summary}</Text>
                  ) : (
                    <Text style={styles.segText} numberOfLines={3}>{seg.text}</Text>
                  )}

                  {seg.people.length > 0 && (
                    <View style={styles.segChips}>
                      {seg.people.slice(0, 4).map((p) => (
                        <View key={p} style={styles.chip}>
                          <Text style={styles.chipText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {seg.topics.length > 0 && (
                    <View style={[styles.segChips, { marginTop: 2 }]}>
                      {seg.topics.slice(0, 3).map((t) => (
                        <View key={t} style={[styles.chip, styles.topicChip]}>
                          <Text style={[styles.chipText, { color: COLORS.textDim }]}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* Places tab */}
        {tab === 'places' && (
          <PlacesTab onRefresh={load} />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Places tab sub-component ─────────────────────────────────────────────────
function PlacesTab({ onRefresh }: { onRefresh: () => void }) {
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof getKnownPlaces>>>([]);

  useEffect(() => { getKnownPlaces().then(setPlaces); }, []);

  const remove = (id: number) => {
    Alert.alert('מחק מקום', 'להסיר מקום זה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          const { removeKnownPlace } = await import('@/services/lifetracker');
          await removeKnownPlace(id);
          getKnownPlaces().then(setPlaces);
          onRefresh();
        },
      },
    ]);
  };

  if (places.length === 0) {
    return <EmptyState icon="location-outline" text="אין מקומות מוכרים" hint='לחץ + בכותרת כדי לשמור את המיקום הנוכחי שלך' />;
  }

  return (
    <>
      {places.map((p) => (
        <View key={p.id} style={styles.placeCard}>
          <Ionicons name={p.icon as any} color={COLORS.accent} size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.placeName}>{p.name}</Text>
            <Text style={styles.placeMeta}>{p.lat.toFixed(5)}, {p.lon.toFixed(5)} · r={p.radiusM}m</Text>
          </View>
          <TouchableOpacity onPress={() => remove(p.id)}>
            <Ionicons name="trash-outline" color={COLORS.danger} size={16} />
          </TouchableOpacity>
        </View>
      ))}
    </>
  );
}

function StatCell({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={styles.statCell}>
      <Ionicons name={icon as any} color={color} size={16} />
      <Text style={[styles.statNum, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ icon, text, hint }: { icon: string; text: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon as any} color={COLORS.textDim} size={44} />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  trackBtnActive: { borderColor: COLORS.success, backgroundColor: `${COLORS.success}12` },
  trackBtnText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  iconBtn: { padding: 2 },

  statsRow: {
    flexDirection: 'row', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.textDim },
  statDivider: { width: 1, backgroundColor: COLORS.border },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  tabTextActive: { color: COLORS.accent, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 14 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 10, marginTop: 16,
  },

  summaryCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: COLORS.accent,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
  summaryText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: `${COLORS.accent}15`, borderRadius: 12,
    paddingVertical: 12, marginBottom: 14,
    borderWidth: 1, borderColor: `${COLORS.accent}30`,
  },
  generateBtnText: { color: COLORS.accent, fontSize: 14, fontWeight: '600' },

  timeline: { paddingLeft: 4 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  timelineLeft: { width: 44, alignItems: 'center' },
  timelineTime: { fontSize: 10, color: COLORS.textDim, marginBottom: 4 },
  timelineLine: { width: 1, flex: 1, backgroundColor: COLORS.border, minHeight: 24 },
  timelineDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  timelineContent: { flex: 1, paddingTop: 4 },
  timelineActivity: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  timelinePlace: { fontSize: 12, color: COLORS.accent, marginTop: 2 },
  timelineCoords: { fontSize: 10, color: COLORS.textDim, marginTop: 2 },

  placeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  placeName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  placeMeta: { fontSize: 11, color: COLORS.textDim, marginTop: 3 },

  passiveStatsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12,
  },
  passiveStatItem: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  passiveDot: { color: COLORS.textDim },

  segCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 13, marginBottom: 10,
    borderLeftWidth: 2, borderLeftColor: COLORS.surfaceHigh,
  },
  segHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  segTypeBadge: {
    backgroundColor: `${COLORS.accent}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  segTypeText: { fontSize: 10, color: COLORS.accent, fontWeight: '600' },
  segTime: { fontSize: 11, color: COLORS.textDim },
  segLocation: { fontSize: 11, color: COLORS.textDim },
  segSumBtn: { marginLeft: 'auto', padding: 4 },
  segText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  segSummary: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  segChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  chip: { backgroundColor: `${COLORS.accent}18`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  topicChip: { backgroundColor: COLORS.surfaceHigh },
  chipText: { fontSize: 10, color: COLORS.accent },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  emptyHint: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', maxWidth: 280 },
});
