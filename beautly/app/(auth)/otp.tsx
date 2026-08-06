import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores/authStore';

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const inputRef = useRef<TextInput>(null);
  const { verifyOtp, sendOtp } = useAuthStore();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function handleVerify(fullCode: string) {
    if (fullCode.length !== CODE_LENGTH) return;
    setLoading(true);
    setError('');
    try {
      const result = await verifyOtp(phone!, fullCode);
      if (result.isNewUser) {
        router.replace('/(auth)/register');
      } else if (result.user.role === 'provider' || result.user.role === 'both') {
        router.replace('/(provider)/(dashboard)');
      } else {
        router.replace('/(customer)/(home)');
      }
    } catch (e: any) {
      setError(e.message || 'קוד שגוי');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(text: string) {
    const cleaned = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);
    if (cleaned.length === CODE_LENGTH) {
      handleVerify(cleaned);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    try {
      await sendOtp(phone!);
      setCountdown(60);
      setError('');
    } catch (e: any) {
      setError(e.message || 'שגיאה בשליחה חוזרת');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>{'← חזרה'}</Text>
          </Pressable>

          <Text style={styles.title}>{'הזינו את הקוד'}</Text>
          <Text style={styles.subtitle}>{'שלחנו קוד אימות ל-'}{phone}</Text>

          <Pressable style={styles.codeContainer} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[styles.codeBox, i < code.length && styles.codeBoxFilled, i === code.length && styles.codeBoxActive]}
              >
                <Text style={styles.codeDigit}>{code[i] || ''}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {loading && <ActivityIndicator size="large" color="#C4636C" style={styles.loader} />}

          <Pressable onPress={handleResend} disabled={countdown > 0}>
            <Text style={[styles.resendText, countdown > 0 && styles.resendDisabled]}>
              {countdown > 0 ? `שליחה חוזרת בעוד ${countdown} שניות` : 'שלחו שוב'}
            </Text>
          </Pressable>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  backButton: {
    marginBottom: 32,
  },
  backText: {
    fontSize: 16,
    color: '#C4636C',
    fontWeight: '500',
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
    marginBottom: 32,
    textAlign: 'right',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  codeBox: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxFilled: {
    borderColor: '#C4636C',
    backgroundColor: '#FFF5F5',
  },
  codeBoxActive: {
    borderColor: '#C4636C',
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  errorText: {
    color: '#DC3545',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  loader: {
    marginVertical: 16,
  },
  resendText: {
    fontSize: 16,
    color: '#C4636C',
    textAlign: 'center',
    fontWeight: '500',
  },
  resendDisabled: {
    color: '#9B9B9B',
  },
});
