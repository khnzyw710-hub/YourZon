import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity,
  Modal, RefreshControl, Alert, ScrollView,
} from 'react-native';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { Business, BusinessStatus } from '../types';

const BUSINESS_TYPES = [
  { key: 'restaurant', label: 'מסעדה/בית קפה', emoji: '🍽️' },
  { key: 'beauty', label: 'יופי/קוסמטיקה', emoji: '💅' },
  { key: 'fitness', label: 'כושר/ספורט', emoji: '💪' },
  { key: 'law', label: 'עורך דין', emoji: '⚖️' },
  { key: 'accounting', label: 'רו"ח/חשבונאות', emoji: '📊' },
  { key: 'retail', label: 'קמעונאות/חנות', emoji: '🛍️' },
  { key: 'clinic', label: 'קליניקה/רפואה', emoji: '🏥' },
  { key: 'real_estate', label: 'נדל"ן', emoji: '🏠' },
  { key: 'education', label: 'חינוך/לימוד', emoji: '📚' },
  { key: 'hotel', label: 'מלונאות/תיירות', emoji: '🏨' },
  { key: 'garage', label: 'מוסך/רכב', emoji: '🔧' },
  { key: 'events', label: 'אירועים/קייטרינג', emoji: '🎉' },
  { key: 'services', label: 'שירותים כלליים', emoji: '🔨' },
];

const STATUS_CONFIG: Record<BusinessStatus, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: Colors.textMuted },
  contacted: { label: 'נפנה', color: Colors.gemini },
  responded: { label: 'הגיב', color: Colors.primary },
  converted: { label: 'הפך ללקוח', color: Colors.accent },
  not_interested: { label: 'לא מעוניין', color: Colors.danger },
};

interface Props {}

export default function BusinessesScreen(_: Props) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [filtered, setFiltered] = useState<Business[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', business_type: '', city: '', website: '', notes: '' });

  const load = useCallback(async () => {
    try {
      const data = await api.getBusinesses();
      setBusinesses(data.businesses);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search) { setFiltered(businesses); return; }
    const q = search.toLowerCase();
    setFiltered(
      businesses.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          b.business_type.toLowerCase().includes(q)
      )
    );
  }, [businesses, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!form.name || !form.phone || !form.business_type || !form.city) {
      Alert.alert('שגיאה', 'יש למלא שם, טלפון, סוג עסק ועיר');
      return;
    }
    try {
      await api.createBusiness(form as Partial<Business>);
      setShowAdd(false);
      setForm({ name: '', phone: '', business_type: '', city: '', website: '', notes: '' });
      load();
    } catch (err) {
      Alert.alert('שגיאה', String(err));
    }
  }, [form, load]);

  const handleDelete = useCallback((id: string, name: string) => {
    Alert.alert('מחק עסק', `למחוק את "${name}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          await api.deleteBusiness(id);
          load();
        },
      },
    ]);
  }, [load]);

  const typeEmoji = (type: string) => BUSINESS_TYPES.find((t) => t.key === type)?.emoji || '🏢';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>עסקים</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ הוסף</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="חיפוש עסק, עיר, סוג..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const statusCfg = STATUS_CONFIG[item.status];
          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.emoji}>{typeEmoji(item.business_type)}</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{item.city} · {item.phone}</Text>
                {item.contact_count > 0 && (
                  <Text style={styles.cardSub}>נפנה {item.contact_count} פעמים</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item.id, item.name)}
              >
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🏢</Text>
            <Text style={styles.emptyText}>אין עסקים ברשימה</Text>
          </View>
        }
      />

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>הוסף עסק חדש</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { key: 'name', placeholder: 'שם העסק *', required: true },
                { key: 'phone', placeholder: 'טלפון (972XXXXXXXXX) *', required: true },
                { key: 'city', placeholder: 'עיר *', required: true },
                { key: 'website', placeholder: 'אתר אינטרנט (אופציונלי)' },
                { key: 'notes', placeholder: 'הערות' },
              ].map((field) => (
                <TextInput
                  key={field.key}
                  style={styles.formInput}
                  placeholder={field.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
                  textAlign="right"
                />
              ))}

              <Text style={styles.typeLabel}>סוג עסק *</Text>
              <View style={styles.typeGrid}>
                {BUSINESS_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeChip, form.business_type === t.key && styles.typeChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, business_type: t.key }))}
                  >
                    <Text style={styles.typeChipEmoji}>{t.emoji}</Text>
                    <Text style={[styles.typeChipText, form.business_type === t.key && styles.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleAdd}>
                <Text style={styles.submitBtnText}>הוסף עסק</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
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
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  cardLeft: { marginRight: 12 },
  emoji: { fontSize: 28 },
  cardContent: { flex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardName: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'right' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, textAlign: 'right' },
  cardSub: { color: Colors.textMuted, fontSize: 11, textAlign: 'right' },
  deleteBtn: { padding: 8, marginLeft: 4 },
  deleteBtnText: { color: Colors.danger, fontSize: 16 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: Colors.textSecondary, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  modalClose: { color: Colors.textMuted, fontSize: 20 },
  formInput: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  typeLabel: { color: Colors.textSecondary, fontSize: 13, marginBottom: 10, textAlign: 'right' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 4,
  },
  typeChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  typeChipEmoji: { fontSize: 16 },
  typeChipText: { color: Colors.textSecondary, fontSize: 12 },
  typeChipTextActive: { color: Colors.primary },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  submitBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
