import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useZonStore, type Conversation } from '@/store';
import ConversationBubble from '@/components/ConversationBubble';
import { COLORS } from '@/constants';

export default function HistoryScreen() {
  const { conversations, currentConversation, clearHistory } = useZonStore();
  const [selected, setSelected] = React.useState<Conversation | null>(null);

  const conv = selected ?? currentConversation;

  const handleClear = () => {
    Alert.alert('מחיקת היסטוריה', 'האם למחוק את כל השיחות?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: clearHistory },
    ]);
  };

  if (conv && !selected && conversations.length > 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>שיחה נוכחית</Text>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Ionicons name="list-outline" color={COLORS.textMuted} size={22} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={conv.messages}
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
        <Text style={styles.title}>היסטוריה</Text>
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
            <TouchableOpacity
              style={styles.convItem}
              onPress={() => setSelected(item)}
            >
              <View style={styles.convItemLeft}>
                <Ionicons name="chatbubble-outline" color={COLORS.accent} size={18} />
                <Text style={styles.convTitle} numberOfLines={1}>
                  {item.title || 'שיחה'}
                </Text>
              </View>
              <View style={styles.convItemRight}>
                <Text style={styles.convCount}>{item.messages.length} הודעות</Text>
                <Text style={styles.convTime}>
                  {new Date(item.createdAt).toLocaleDateString('he-IL')}
                </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  listContent: { paddingVertical: 8 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  convItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  convItemRight: { alignItems: 'flex-end', gap: 2 },
  convTitle: { fontSize: 14, color: COLORS.text, flex: 1 },
  convCount: { fontSize: 11, color: COLORS.textMuted },
  convTime: { fontSize: 11, color: COLORS.textDim },
});
