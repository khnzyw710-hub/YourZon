import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useZonStore } from '@/store';
import { useListening } from '@/hooks/useListening';
import { useRecognitionEvents } from '@/services/speech/recognition';
import WaveAnimation from '@/components/WaveAnimation';
import StatusIndicator from '@/components/StatusIndicator';
import ConversationBubble from '@/components/ConversationBubble';
import { COLORS } from '@/constants';

export default function MainScreen() {
  useKeepAwake();
  useRecognitionEvents(); // wire speech events into the service layer

  const { listeningState, liveTranscript, toggleListening } = useListening();
  const { activeProvider, currentConversation, newConversation, errorMessage, setError } =
    useZonStore();

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [currentConversation?.messages]);

  const messages = currentConversation?.messages ?? [];

  const mainColor =
    listeningState === 'active'
      ? COLORS.success
      : listeningState === 'processing'
      ? COLORS.warning
      : listeningState === 'passive'
      ? COLORS.accent
      : COLORS.textDim;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>ZON</Text>
          <StatusIndicator state={listeningState} activeProvider={activeProvider} />
          <TouchableOpacity onPress={newConversation} style={styles.newBtn}>
            <Ionicons name="add-circle-outline" color={COLORS.textMuted} size={22} />
          </TouchableOpacity>
        </View>

        {/* Error banner */}
        {errorMessage && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setError(null)}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Ionicons name="close" color={COLORS.danger} size={16} />
          </TouchableOpacity>
        )}

        {/* Conversation */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>זון מוכנה</Text>
              <Text style={styles.emptySubtitle}>
                אמור "{useZonStore.getState().settings.wakeWord}" להפעיל
              </Text>
            </View>
          )}
          {messages.map((msg) => (
            <ConversationBubble key={msg.id} message={msg} />
          ))}
        </ScrollView>

        {/* Live transcript */}
        {liveTranscript.length > 0 && (
          <View style={styles.liveTranscript}>
            <Text style={styles.liveText} numberOfLines={2}>
              {liveTranscript}
            </Text>
          </View>
        )}

        {/* Wave + Power button */}
        <View style={styles.controls}>
          <WaveAnimation state={listeningState} color={mainColor} />

          <TouchableOpacity
            onPress={toggleListening}
            style={[
              styles.powerBtn,
              {
                borderColor: mainColor,
                backgroundColor:
                  listeningState !== 'off'
                    ? `${mainColor}18`
                    : COLORS.surface,
              },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={listeningState === 'off' ? 'power' : 'mic'}
              color={mainColor}
              size={30}
            />
          </TouchableOpacity>

          <Text style={styles.powerHint}>
            {listeningState === 'off'
              ? 'לחץ להפעלה'
              : listeningState === 'passive'
              ? `אמור "${useZonStore.getState().settings.wakeWord}"`
              : listeningState === 'active'
              ? 'מקשיבה לך...'
              : 'מעבד...'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 4,
  },
  newBtn: { padding: 4 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${COLORS.danger}22`,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1 },

  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 12 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textDim,
    marginTop: 8,
  },

  liveTranscript: {
    backgroundColor: COLORS.surfaceHigh,
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.accent,
  },
  liveText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  controls: {
    alignItems: 'center',
    paddingBottom: 16,
    paddingTop: 8,
    gap: 12,
  },
  powerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerHint: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
