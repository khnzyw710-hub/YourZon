import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TextInput, TouchableOpacity,
} from 'react-native';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import ConversationItem from '../components/ConversationItem';
import { Conversation } from '../types';

interface Props {
  navigation: { navigate: (screen: string, params?: object) => void };
}

export default function ConversationsScreen({ navigation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'responded' | 'pending'>('all');

  const load = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data.conversations);
    } catch {
      // ignore
    }
  }, []);

  useSocket({
    'message:new': () => load(),
    'message:sent': () => load(),
  });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let result = conversations;
    if (filter === 'responded') {
      result = result.filter((c) => c.inbound_count > 0);
    } else if (filter === 'pending') {
      result = result.filter((c) => c.inbound_count === 0);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.business_name.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [conversations, search, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const FILTERS: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'הכל' },
    { key: 'responded', label: 'הגיבו' },
    { key: 'pending', label: 'ממתינים' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>שיחות</Text>
        <Text style={styles.count}>{filtered.length}</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="חיפוש עסק..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>אין שיחות עדיין</Text>
            <Text style={styles.emptySubtext}>שלח הודעות יומיות מלוח הבקרה</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  count: {
    backgroundColor: Colors.primary + '30',
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  searchRow: { paddingHorizontal: 16, marginBottom: 8 },
  search: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterBtnActive: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primary,
  },
  filterText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: Colors.primary },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
});
