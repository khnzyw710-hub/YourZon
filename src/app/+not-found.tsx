import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'לא נמצא' }} />
      <View style={styles.container}>
        <Text style={styles.title}>דף לא נמצא</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: COLORS.accent }}>חזור לדף הבית</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.text, fontSize: 20, marginBottom: 16 },
  link: { paddingVertical: 8 },
});
