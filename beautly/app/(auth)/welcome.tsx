import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <Text style={styles.logo}>Beautly</Text>
          <Text style={styles.tagline}>{'שירותי יופי עד הבית'}</Text>
          <Text style={styles.subtitle}>{'הזמינו מעצבי שיער, מניקוריסטיות,'}{'\n'}{'מאפרות ועוד - ישירות אליכם'}</Text>
        </View>

        <View style={styles.bottomSection}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push('/(auth)/phone')}
          >
            <Text style={styles.primaryButtonText}>{'התחילו עכשיו'}</Text>
          </Pressable>

          <Text style={styles.termsText}>
            {'בהמשך אתם מסכימים לתנאי השימוש ומדיניות הפרטיות'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5F5',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: '#C4636C',
    marginBottom: 12,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2D2D2D',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomSection: {
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#C4636C',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  termsText: {
    fontSize: 12,
    color: '#9B9B9B',
    textAlign: 'center',
  },
});
