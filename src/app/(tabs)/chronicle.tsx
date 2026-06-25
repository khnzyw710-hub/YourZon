import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import {
  getJournalEntries, getRelationships, getSkillTree, getChronicleStats,
  getBehavioralPrediction,
  type JournalEntry, type Relationship, type SkillNode,
} from '@/services/chronicle';
import { COLORS } from '@/constants';

type Tab = 'journal' | 'people' | 'skills';

export default function ChronicleScreen() {
  const [tab, setTab] = useState<Tab>('journal');
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [skills, setSkills] = useState<SkillNode[]>([]);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalConversations: 0, totalPeople: 0, topTopics: [] as SkillNode[], streak: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [j, r, s, st, pred] = await Promise.all([
      getJournalEntries(20),
      getRelationships(),
      getSkillTree(),
      getChronicleStats(),
      getBehavioralPrediction(),
    ]);
    setJournal(j);
    setRelationships(r);
    setSkills(s);
    setStats(st);
    setPrediction(pred);
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const levelColor = (level: SkillNode['level']) => {
    switch (level) {
      case 'beginner': return COLORS.textDim;
      case 'intermediate': return COLORS.textMuted;
      case 'advanced': return COLORS.accent;
      case 'expert': return COLORS.warning;
    }
  };

  const levelLabel = (level: SkillNode['level']) => {
    switch (level) {
      case 'beginner': return 'מתחיל';
      case 'intermediate': return 'בינוני';
      case 'advanced': return 'מתקדם';
      case 'expert': return 'מומחה';
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>כרוניקה</Text>
        {stats.streak > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" color={COLORS.warning} size={14} />
            <Text style={styles.streakText}>{stats.streak}</Text>
          </View>
        )}
      </View>

      {/* Stats strip */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statNum}>{stats.totalConversations}</Text>
          <Text style={styles.statLabel}>שיחות</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statNum}>{stats.totalPeople}</Text>
          <Text style={styles.statLabel}>אנשים</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statNum}>{skills.length}</Text>
          <Text style={styles.statLabel}>נושאים</Text>
        </View>
      </View>

      {/* Prediction banner */}
      {prediction && (
        <View style={styles.predictionBanner}>
          <Ionicons name="bulb-outline" color={COLORS.warning} size={15} />
          <Text style={styles.predictionText}>{prediction}</Text>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['journal', 'people', 'skills'] as Tab[]).map((t) => {
          const labels = { journal: 'יומן', people: 'אנשים', skills: 'מיומנויות' };
          const icons: Record<Tab, any> = {
            journal: 'book-outline',
            people: 'people-outline',
            skills: 'school-outline',
          };
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Ionicons name={icons[t]} color={tab === t ? COLORS.accent : COLORS.textMuted} size={16} />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {labels[t]}
              </Text>
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
        {/* Journal tab */}
        {tab === 'journal' && (
          journal.length === 0 ? (
            <EmptyState icon="book-outline" text="אין יומן עדיין" hint="יומן נוצר אוטומטית בסוף כל יום שיש שיחות" />
          ) : (
            journal.map((entry) => (
              <View key={entry.date} style={styles.journalCard}>
                <View style={styles.journalHeader}>
                  <Text style={styles.journalDate}>{entry.date}</Text>
                  {entry.keyTopics.length > 0 && (
                    <View style={styles.topicRow}>
                      {entry.keyTopics.slice(0, 3).map((t) => (
                        <View key={t} style={styles.topicChip}>
                          <Text style={styles.topicText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <Text style={styles.journalContent}>{entry.content}</Text>
                {entry.peopleMentioned.length > 0 && (
                  <Text style={styles.journalPeople}>
                    <Ionicons name="person-outline" size={11} color={COLORS.textDim} /> {entry.peopleMentioned.join(', ')}
                  </Text>
                )}
              </View>
            ))
          )
        )}

        {/* People tab */}
        {tab === 'people' && (
          relationships.length === 0 ? (
            <EmptyState icon="people-outline" text="לא נזכרו אנשים" hint="Zon תזהה ותזכור אנשים שתציין בשיחות" />
          ) : (
            relationships.map((r) => (
              <View key={r.id} style={styles.personCard}>
                <View style={styles.personAvatar}>
                  <Text style={styles.personInitial}>{r.name[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.personRow}>
                    <Text style={styles.personName}>{r.name}</Text>
                    <Text style={styles.personCount}>{r.interactionCount}x</Text>
                  </View>
                  <Text style={styles.personTopics} numberOfLines={1}>
                    {r.topics.slice(0, 4).join(' · ')}
                  </Text>
                  <Text style={styles.personLastSeen}>
                    לפני {Math.floor((Date.now() - r.lastSeen) / 86400000)}ד
                  </Text>
                </View>
              </View>
            ))
          )
        )}

        {/* Skills tab */}
        {tab === 'skills' && (
          skills.length === 0 ? (
            <EmptyState icon="school-outline" text="אין מיומנויות עדיין" hint="Zon תמפה מה אתה לומד ועוסק בו" />
          ) : (
            skills.map((s) => (
              <View key={s.topic} style={styles.skillRow}>
                <View style={styles.skillLeft}>
                  <Text style={styles.skillTopic}>{s.topic}</Text>
                  <Text style={[styles.skillLevel, { color: levelColor(s.level) }]}>
                    {levelLabel(s.level)}
                  </Text>
                </View>
                <View style={styles.skillBarBg}>
                  <View
                    style={[
                      styles.skillBarFill,
                      {
                        width: `${Math.min(100, (s.count / 60) * 100)}%`,
                        backgroundColor: levelColor(s.level),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.skillCount}>{s.count}</Text>
              </View>
            ))
          )
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyState({ icon, text, hint }: { icon: any; text: string; hint: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} color={COLORS.textDim} size={44} />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.warning}18`, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  streakText: { color: COLORS.warning, fontSize: 13, fontWeight: '700' },

  statsRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border },

  predictionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${COLORS.warning}10`, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  predictionText: { color: COLORS.warning, fontSize: 13, flex: 1 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  tabTextActive: { color: COLORS.accent, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  emptyHint: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', maxWidth: 260 },

  journalCard: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderLeftWidth: 2, borderLeftColor: COLORS.accent,
  },
  journalHeader: { marginBottom: 8 },
  journalDate: { fontSize: 11, color: COLORS.textDim, marginBottom: 4 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  topicChip: { backgroundColor: `${COLORS.accent}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  topicText: { fontSize: 10, color: COLORS.accent },
  journalContent: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  journalPeople: { fontSize: 11, color: COLORS.textDim, marginTop: 8 },

  personCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 8,
  },
  personAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: `${COLORS.accent}30`,
    alignItems: 'center', justifyContent: 'center',
  },
  personInitial: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  personRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  personCount: { fontSize: 12, color: COLORS.textDim },
  personTopics: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  personLastSeen: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  skillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  skillLeft: { width: 100 },
  skillTopic: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  skillLevel: { fontSize: 10, marginTop: 2 },
  skillBarBg: { flex: 1, height: 6, backgroundColor: COLORS.surfaceHigh, borderRadius: 3, overflow: 'hidden' },
  skillBarFill: { height: '100%', borderRadius: 3 },
  skillCount: { fontSize: 11, color: COLORS.textDim, width: 30, textAlign: 'right' },
});
