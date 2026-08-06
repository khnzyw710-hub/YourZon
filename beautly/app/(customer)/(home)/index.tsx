import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../src/stores/authStore';
import { colors, spacing, borderRadius } from '../../../src/lib/theme';

const CATEGORIES = [
  { id: 'haircut', nameHe: 'תספורת', icon: '✂️' },
  { id: 'nails', nameHe: 'ציפורניים', icon: '💅' },
  { id: 'makeup', nameHe: 'איפור', icon: '💄' },
  { id: 'eyebrows', nameHe: 'גבות', icon: '👁️' },
  { id: 'cosmetics', nameHe: 'קוסמטיקה', icon: '🧴' },
  { id: 'massage', nameHe: 'עיסוי', icon: '💆' },
  { id: 'styling', nameHe: 'עיצוב שיער', icon: '💇' },
  { id: 'waxing', nameHe: 'הסרת שיער', icon: '⚡' },
  { id: 'facial', nameHe: 'טיפולי פנים', icon: '🌸' },
  { id: 'coloring', nameHe: 'צביעת שיער', icon: '🎨' },
  { id: 'barber', nameHe: 'ברבר', icon: '💈' },
  { id: 'gel-polish', nameHe: "לק ג'ל", icon: '✨' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const greeting = user?.first_name ? `שלום, ${user.first_name}` : 'שלום';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.headerSubtitle}>מה בא לכם היום?</Text>
        </View>

        <Pressable style={styles.searchBar}>
          <Text style={styles.searchText}>🔍 חפשו שירות או מומחה...</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>קטגוריות</Text>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((category) => (
              <Pressable
                key={category.id}
                style={styles.categoryCard}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryName}>{category.nameHe}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>מומחים מובילים</Text>
            <Pressable>
              <Text style={styles.seeAll}>הכל</Text>
            </Pressable>
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>בקרוב כאן יופיעו מומחי היופי הטובים ביותר</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'right' },
  headerSubtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4, textAlign: 'right' },
  searchBar: {
    marginHorizontal: spacing.lg, marginVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  searchText: { fontSize: 15, color: colors.textTertiary, textAlign: 'right' },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'right', marginBottom: spacing.md },
  seeAll: { fontSize: 14, fontWeight: '600', color: colors.primary },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: {
    width: '30%', backgroundColor: colors.primaryBg, borderRadius: borderRadius.md,
    paddingVertical: 16, alignItems: 'center', gap: 6,
  },
  categoryIcon: { fontSize: 28 },
  categoryName: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
