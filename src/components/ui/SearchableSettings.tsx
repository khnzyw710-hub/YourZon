import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export interface SettingItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  keywords?: string[];
  onPress: () => void;
  rightElement?: React.ReactNode;
}

interface SearchableSettingsProps {
  items: SettingItem[];
  placeholder?: string;
  onClose?: () => void;
}

function fuzzyMatch(query: string, item: SettingItem): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const searchable = [item.title, item.description ?? '', item.category, ...(item.keywords ?? [])]
    .join(' ')
    .toLowerCase();
  return q.split(' ').every((word) => searchable.includes(word));
}

export function SearchableSettings({ items, placeholder = 'Search settings…', onClose }: SearchableSettingsProps) {
  const { theme, fontScale } = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter((item) => fuzzyMatch(query, item));
  }, [query, items]);

  const grouped = useMemo(() => {
    const groups: Record<string, SettingItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return Object.entries(groups);
  }, [filtered]);

  const renderItem = useCallback(({ item }: { item: SettingItem }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: theme.border }]}
      onPress={item.onPress}
      accessibilityLabel={item.title}
      accessibilityHint={item.description}
    >
      <View style={styles.itemContent}>
        <Text style={[styles.itemTitle, { color: theme.text, fontSize: 16 * fontScale }]}>{item.title}</Text>
        {item.description ? (
          <Text style={[styles.itemDesc, { color: theme.textSecondary, fontSize: 13 * fontScale }]}>
            {item.description}
          </Text>
        ) : null}
      </View>
      {item.rightElement}
    </TouchableOpacity>
  ), [theme, fontScale]);

  const renderGroup = ({ item: [category, groupItems] }: { item: [string, SettingItem[]] }) => (
    <View key={category}>
      <Text style={[styles.groupHeader, { color: theme.textSecondary, backgroundColor: theme.surface }]}>
        {category.toUpperCase()}
      </Text>
      {groupItems.map((settingItem) => (
        <React.Fragment key={settingItem.id}>
          {renderItem({ item: settingItem })}
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, fontSize: 16 * fontScale }]}
          autoFocus
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search settings"
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No settings found for "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([category]) => category}
          renderItem={renderGroup}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
  },
  input: { flex: 1 },
  list: { paddingBottom: 32 },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontWeight: '500' },
  itemDesc: { marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
