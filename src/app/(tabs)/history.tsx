import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useZonStore, type Conversation } from '@/store';
import ConversationBubble from '@/components/ConversationBubble';
import { shareConversationAsPDF, shareConversationAsText } from '@/services/export';
import { COLORS } from '@/constants';

export default function HistoryScreen() {
  const { conversations, currentConversation, clearHistory } = useZonStore();
  const [selected, setSelected] = useState<Conversation | null>(null);

  const conv = selected ?? currentConversation;

  const handleClear = () => {
    Alert.alert('מחיקת היסטוריה', 'למחוק את כל השיחות?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: clearHistory },
    ]);
  };

  const handleExport = (c: Conversation) => {
    Alert.alert('ייצוא שיחה', 'בחר פורמט', [
      { text: 'PDF', onPress: () => shareConversationAsPDF(c) },
      { text: 'טקסט / WhatsApp', onPress: () => shareConversationAsText(c) },
      { text: 'ביטול', style: 'cancel' },
    ]);
  };

  if (selected) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Ionicons name="arrow-back" color={COLORS.textMuted} size={22} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{selected.title}</Text>
          <TouchableOpacity onPress={() => handleExport(selected)}>
            <Ionicons name="share-outline" color={COLORS.accent} size={22} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={selected.messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <ConversationBubble message={item} />}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>שיחות</Text>
        {conversations.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="trash-outline" color={COLORS.danger} size={20} />
          </TouchableOpacity>
        )}
      </View>

      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" color={COLORS.textDim} size={48} />
          <Text style={styles.emptyText}>אין שיחות עדיין</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convItem} onPress={() => setSelected(item)}>
              <View style={styles.convLeft}>
                <Ionicons name="chatbubble-outline" color={COLORS.accent} size={16} />
                <Text style={styles.convTitle} numberOfLines={1}>{item.title || 'שיחה'}</Text>
              </View>
              <View style={styles.convRight}>
                <Text style={styles.convCount}>{item.messages.length}</Text>
                <TouchableOpacity onPress={() => handleExport(item)}>
                  <Ionicons name="share-outline" color={COLORS.textDim} size={16} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  listContent: { paddingVertical: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  convItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  convLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  convRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  convTitle: { fontSize: 14, color: COLORS.text, flex: 1 },
  convCount: { fontSize: 12, color: COLORS.textMuted },
});
