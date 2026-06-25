import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listAllFacts, deleteFact, clearAllFacts, type MemoryFact } from '@/services/memory';
import { getTopEntities, getEntityRelations, deleteEntity, type Entity } from '@/services/knowledge/graph';
import { getPendingCommitments, markCommitmentDone, deleteCommitment, type Commitment } from '@/services/commitments';
import { COLORS } from '@/constants';
import { format } from 'date-fns';

type Tab = 'facts' | 'knowledge' | 'commitments';

const ENTITY_TYPE_ICONS: Record<string, string> = {
  person: 'person-outline',
  place: 'location-outline',
  project: 'briefcase-outline',
  task: 'checkbox-outline',
  organization: 'business-outline',
  concept: 'bulb-outline',
  date: 'calendar-outline',
};

export default function MemoryScreen() {
  const [tab, setTab] = useState<Tab>('facts');
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [entityRelations, setEntityRelations] = useState<Awaited<ReturnType<typeof getEntityRelations>>>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);

  const loadFacts = async () => setFacts(await listAllFacts());
  const loadEntities = async () => setEntities(await getTopEntities(30));
  const loadCommitments = async () => setCommitments(await getPendingCommitments());

  useEffect(() => {
    loadFacts();
    loadEntities();
    loadCommitments();
  }, []);

  useEffect(() => {
    if (tab === 'facts') loadFacts();
    else if (tab === 'knowledge') loadEntities();
    else loadCommitments();
  }, [tab]);

  const handleSelectEntity = async (entity: Entity) => {
    setSelectedEntity(entity);
    const rels = await getEntityRelations(entity.name);
    setEntityRelations(rels);
  };

  const handleDeleteFact = (id: number) => {
    Alert.alert('מחיקת זיכרון', 'למחוק עובדה זו?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: async () => { await deleteFact(id); loadFacts(); } },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('מחיקת כל הזיכרון', 'Zon תשכח הכל. להמשיך?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק הכל', style: 'destructive', onPress: async () => { await clearAllFacts(); loadFacts(); } },
    ]);
  };

  const handleDeleteEntity = (name: string) => {
    Alert.alert('מחיקת ישות', `למחוק "${name}" מגרף הידע?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          await deleteEntity(name);
          setSelectedEntity(null);
          loadEntities();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>זיכרון</Text>
        {tab === 'facts' && facts.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" color={COLORS.danger} size={20} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['facts', 'knowledge', 'commitments'] as Tab[]).map((t) => {
          const labels = { facts: 'עובדות', knowledge: 'ידע', commitments: 'התחייבויות' };
          const icons: Record<Tab, string> = {
            facts: 'hardware-chip-outline',
            knowledge: 'git-network-outline',
            commitments: 'checkmark-circle-outline',
          };
          const badge = t === 'commitments' && commitments.length > 0 ? commitments.length : 0;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <View style={styles.tabIconWrap}>
                <Ionicons name={icons[t] as any} color={tab === t ? COLORS.accent : COLORS.textMuted} size={15} />
                {badge > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
                )}
              </View>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{labels[t]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Facts tab */}
      {tab === 'facts' && (
        facts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="brain-outline" color={COLORS.textDim} size={48} />
            <Text style={styles.emptyText}>Zon עוד לא למדה עליך כלום</Text>
            <Text style={styles.emptyHint}>עובדות נשמרות אוטומטית מהשיחות</Text>
          </View>
        ) : (
          <FlatList
            data={facts}
            keyExtractor={(f) => String(f.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.factRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.factText}>{item.content}</Text>
                  <View style={styles.factMeta}>
                    <Text style={styles.factDate}>
                      {format(new Date(item.createdAt), 'dd/MM/yy HH:mm')}
                    </Text>
                    <Text style={styles.impBadge}>{'★'.repeat(Math.min(item.importance, 3))}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleDeleteFact(item.id)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle-outline" color={COLORS.textDim} size={20} />
                </TouchableOpacity>
              </View>
            )}
          />
        )
      )}

      {/* Knowledge Graph tab */}
      {tab === 'knowledge' && (
        selectedEntity ? (
          <ScrollView contentContainerStyle={styles.list}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedEntity(null)}>
              <Ionicons name="arrow-back" color={COLORS.accent} size={16} />
              <Text style={styles.backText}>חזרה לגרף</Text>
            </TouchableOpacity>
            <View style={styles.entityDetail}>
              <View style={styles.entityDetailHeader}>
                <Ionicons name={ENTITY_TYPE_ICONS[selectedEntity.type] as any} color={COLORS.accent} size={24} />
                <Text style={styles.entityDetailName}>{selectedEntity.name}</Text>
                <TouchableOpacity onPress={() => handleDeleteEntity(selectedEntity.name)} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="trash-outline" color={COLORS.danger} size={18} />
                </TouchableOpacity>
              </View>
              <Text style={styles.entityDetailMeta}>
                הוזכר {selectedEntity.mentionCount} פעם
              </Text>
              {selectedEntity.summary && (
                <Text style={styles.entityDetailSummary}>{selectedEntity.summary}</Text>
              )}
            </View>

            {entityRelations.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>קשרים</Text>
                {entityRelations.map((rel, i) => (
                  <View key={i} style={styles.relRow}>
                    <Text style={styles.relFrom}>{rel.fromEntity}</Text>
                    <Text style={styles.relType}>{rel.relation}</Text>
                    <Text style={styles.relTo}>{rel.toEntity}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        ) : (
          entities.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="git-network-outline" color={COLORS.textDim} size={48} />
              <Text style={styles.emptyText}>גרף הידע ריק</Text>
              <Text style={styles.emptyHint}>ישויות נלמדות אוטומטית מהשיחות</Text>
            </View>
          ) : (
            <FlatList
              data={entities}
              keyExtractor={(e) => String(e.id)}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.entityRow} onPress={() => handleSelectEntity(item)}>
                  <View style={styles.entityIcon}>
                    <Ionicons name={ENTITY_TYPE_ICONS[item.type] as any} color={COLORS.accent} size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entityName}>{item.name}</Text>
                    <Text style={styles.entityType}>{item.type}</Text>
                  </View>
                  <Text style={styles.entityCount}>{item.mentionCount}x</Text>
                  <Ionicons name="chevron-forward" color={COLORS.textDim} size={14} />
                </TouchableOpacity>
              )}
            />
          )
        )
      )}

      {/* Commitments tab */}
      {tab === 'commitments' && (
        commitments.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" color={COLORS.textDim} size={48} />
            <Text style={styles.emptyText}>אין התחייבויות פתוחות</Text>
            <Text style={styles.emptyHint}>Zon מזהה "אצלצל ל..." ו"צריך לסיים..." אוטומטית</Text>
          </View>
        ) : (
          <FlatList
            data={commitments}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const overdue = item.dueTs && item.dueTs < Date.now();
              return (
                <View style={[styles.commitRow, overdue && styles.commitRowOverdue]}>
                  <TouchableOpacity
                    style={styles.commitCheck}
                    onPress={async () => { await markCommitmentDone(item.id); loadCommitments(); }}
                  >
                    <Ionicons name="checkmark-circle-outline" color={COLORS.success} size={22} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commitText}>{item.text}</Text>
                    {item.dueTs && (
                      <Text style={[styles.commitDue, overdue && { color: COLORS.danger }]}>
                        {overdue ? 'באיחור: ' : 'עד: '}
                        {format(new Date(item.dueTs), 'dd/MM HH:mm')}
                      </Text>
                    )}
                    {item.person && (
                      <Text style={styles.commitPerson}>
                        <Ionicons name="person-outline" size={11} color={COLORS.textDim} /> {item.person}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={async () => { await deleteCommitment(item.id); loadCommitments(); }}>
                    <Ionicons name="close-circle-outline" color={COLORS.textDim} size={18} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      )}
    </SafeAreaView>
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

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  tabTextActive: { color: COLORS.accent, fontWeight: '700' },
  tabIconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: COLORS.danger, borderRadius: 6,
    minWidth: 12, height: 12, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 8, color: '#fff', fontWeight: '700' },

  list: { padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  emptyHint: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', maxWidth: 260 },

  factRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, marginBottom: 8,
    borderLeftWidth: 2, borderLeftColor: COLORS.accent,
  },
  factText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  factMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  factDate: { color: COLORS.textDim, fontSize: 11 },
  impBadge: { fontSize: 10, color: COLORS.warning },

  entityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  entityIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${COLORS.accent}20`,
    alignItems: 'center', justifyContent: 'center',
  },
  entityName: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  entityType: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },
  entityCount: { fontSize: 12, color: COLORS.textMuted, marginRight: 4 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: COLORS.accent, fontSize: 14 },
  entityDetail: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: COLORS.accent,
  },
  entityDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  entityDetailName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  entityDetailMeta: { fontSize: 12, color: COLORS.textDim },
  entityDetailSummary: { fontSize: 14, color: COLORS.textMuted, marginTop: 8, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  relRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 8,
    padding: 10, marginBottom: 6,
  },
  relFrom: { fontSize: 13, color: COLORS.text, fontWeight: '600', flex: 1 },
  relType: { fontSize: 11, color: COLORS.textDim, fontStyle: 'italic' },
  relTo: { fontSize: 13, color: COLORS.accent, fontWeight: '600', flex: 1, textAlign: 'right' },

  commitRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  commitRowOverdue: { borderLeftWidth: 2, borderLeftColor: COLORS.danger },
  commitCheck: { paddingTop: 1 },
  commitText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  commitDue: { fontSize: 11, color: COLORS.textDim, marginTop: 3 },
  commitPerson: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },
});
