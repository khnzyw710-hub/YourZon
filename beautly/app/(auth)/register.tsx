import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores/authStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { updateProfile, user } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'customer' | 'provider'>('customer');

  const isValid = firstName.trim().length >= 2;

  async function handleSubmit() {
    if (!isValid) return;
    setLoading(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
      if (role === 'customer') {
        router.replace('/(customer)/(home)');
      } else {
        router.replace('/(provider)/(dashboard)');
      }
    } catch (e: any) {
      console.error('Registration error:', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>{'ספרו לנו על עצמכם'}</Text>
          <Text style={styles.subtitle}>{'נתחיל עם הפרטים הבסיסיים'}</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{'שם פרטי *'}</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder={'הכניסו שם פרטי'}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{'שם משפחה'}</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder={'הכניסו שם משפחה'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{'איך תרצו להשתמש ב-Beautly?'}</Text>
              <View style={styles.roleContainer}>
                <Pressable
                  style={[styles.roleOption, role === 'customer' && styles.roleOptionSelected]}
                  onPress={() => setRole('customer')}
                >
                  <Text style={[styles.roleIcon]}>{'💅'}</Text>
                  <Text style={[styles.roleText, role === 'customer' && styles.roleTextSelected]}>
                    {'להזמין שירותים'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.roleOption, role === 'provider' && styles.roleOptionSelected]}
                  onPress={() => setRole('provider')}
                >
                  <Text style={[styles.roleIcon]}>{'✂️'}</Text>
                  <Text style={[styles.roleText, role === 'provider' && styles.roleTextSelected]}>
                    {'לתת שירותים'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>{'המשך'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 8,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B6B6B',
    marginBottom: 40,
    textAlign: 'right',
  },
  form: {
    gap: 24,
    marginBottom: 40,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A4A4A',
    textAlign: 'right',
  },
  input: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#2D2D2D',
    textAlign: 'right',
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  roleOptionSelected: {
    borderColor: '#C4636C',
    backgroundColor: '#FFF5F5',
  },
  roleIcon: {
    fontSize: 32,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  roleTextSelected: {
    color: '#C4636C',
  },
  submitButton: {
    backgroundColor: '#C4636C',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  submitButtonDisabled: {
    backgroundColor: '#D4A0A5',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
