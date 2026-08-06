import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../src/stores/authStore';
import { colors, spacing, borderRadius } from '../../../src/lib/theme';

export default function ProviderDashboard() {
  const { user } = useAuthStore();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.greeting}>שלום, {user?.first_name || 'מומחה'} 👋</Text>
          <Text style={styles.subtitle}>הנה הסיכום שלך</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₪0</Text>
            <Text style={styles.statLabel}>הכנסות היום</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>הזמנות היום</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>⭐ -</Text>
            <Text style={styles.statLabel}>דירוג</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>הזמנות קרובות</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>אין הזמנות קרובות</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'right' },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 4, textAlign: 'right' },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: colors.primaryBg, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  section: { paddingHorizontal: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'right', marginBottom: spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: colors.textSecondary },
});
