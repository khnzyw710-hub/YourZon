import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listAllFacts, deleteFact, clearAllFacts, type MemoryFact } from '@/services/memory';
import { COLORS } from '@/constants';
import { format } from 'date-fns';

export default function MemoryScreen() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);

  const load = async () => {
    setFacts(await listAllFacts());
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (id: number) => {
    Alert.alert('מחיקת זיכרון', 'למחוק עובדה זו?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => { await deleteFact(id); load(); },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('מחיקת כל הזיכרון', 'Zon תשכח הכל. להמשיך?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק הכל', style: 'destructive',
        onPress: async () => { await clearAllFacts(); load(); },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>זיכרון</Text>
        {facts.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" color={COLORS.danger} size={20} />
          </TouchableOpacity>
        )}
      </View>

      {facts.length === 0 ? (
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
                  <View style={styles.impBadge}>
                    {'⭐'.repeat(Math.min(item.importance, 3))}
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 4 }}>
                <Ionicons name="close-circle-outline" color={COLORS.textDim} size={20} />
              </TouchableOpacity>
            </View>
          )}
        />
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
  list: { padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  emptyHint: { color: COLORS.textDim, fontSize: 12 },
  factRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, marginBottom: 8,
    borderLeftWidth: 2, borderLeftColor: COLORS.accent,
  },
  factText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  factMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  factDate: { color: COLORS.textDim, fontSize: 11 },
  impBadge: { fontSize: 10 },
});
