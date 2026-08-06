import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../src/stores/authStore';
import { colors, spacing, borderRadius } from '../../../src/lib/theme';

export default function ProviderProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/welcome');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>הפרופיל שלי</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.first_name?.[0] || '?'}</Text>
          </View>
          <Text style={styles.name}>{user?.first_name} {user?.last_name}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>

        <View style={styles.menuSection}>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>עריכת פרופיל</Text>
            <Text style={styles.menuArrow}>←</Text>
          </Pressable>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>תיק עבודות</Text>
            <Text style={styles.menuArrow}>←</Text>
          </Pressable>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>שירותים ומחירים</Text>
            <Text style={styles.menuArrow}>←</Text>
          </Pressable>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>הגדרות</Text>
            <Text style={styles.menuArrow}>←</Text>
          </Pressable>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>התנתקות</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'right' },
  profileCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: colors.white },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  phone: { fontSize: 14, color: colors.textSecondary },
  menuSection: {
    marginHorizontal: spacing.lg, backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  menuText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  menuArrow: { fontSize: 18, color: colors.textTertiary },
  logoutButton: {
    marginHorizontal: spacing.lg, marginTop: spacing.xl, paddingVertical: 16,
    alignItems: 'center', borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.error,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.error },
});
