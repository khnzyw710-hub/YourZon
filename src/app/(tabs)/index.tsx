import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, Pressable, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useZonStore } from '@/store';
import { useListening } from '@/hooks/useListening';
import { useRecognitionEvents } from '@/services/speech/recognition';
import { setCameraRef, startSceneMonitor, stopSceneMonitor } from '@/services/camera';
import { showListeningNotification, hideListeningNotification, registerBackgroundTask } from '@/services/background';
import { getContextIcon, getContextLabel } from '@/services/ambient';
import ZonOrb from '@/components/ZonOrb';
import StatusIndicator from '@/components/StatusIndicator';
import ConversationBubble from '@/components/ConversationBubble';
import { COLORS, AI_PROVIDERS } from '@/constants';

export default function MainScreen() {
  useKeepAwake();
  useRecognitionEvents();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const {
    listeningState, liveTranscript, streamingText,
    activeProvider, currentConversation, newConversation,
    errorMessage, setError, settings, micActive,
    coachingTip, setCoachingTip, agentProgress,
    ambientContext, proactiveMessage, setProactiveMessage,
  } = useZonStore((s) => ({
    listeningState: s.listeningState,
    liveTranscript: s.liveTranscript,
    streamingText: s.streamingText,
    activeProvider: s.activeProvider,
    currentConversation: s.currentConversation,
    newConversation: s.newConversation,
    errorMessage: s.errorMessage,
    setError: s.setError,
    settings: s.settings,
    micActive: s.micActive,
    coachingTip: s.coachingTip,
    setCoachingTip: s.setCoachingTip,
    agentProgress: s.agentProgress,
    ambientContext: s.ambientContext,
    proactiveMessage: s.proactiveMessage,
    setProactiveMessage: s.setProactiveMessage,
  }));

  const { toggleListening } = useListening();
  const scrollRef = useRef<ScrollView>(null);
  const camRef = useRef<CameraView>(null);

  // Register background task on mount
  useEffect(() => {
    registerBackgroundTask().catch(() => {});
  }, []);

  // Show/hide persistent notification
  useEffect(() => {
    if (micActive) showListeningNotification().catch(() => {});
    else hideListeningNotification().catch(() => {});
    return () => { hideListeningNotification().catch(() => {}); };
  }, [micActive]);

  // Camera ref
  useEffect(() => {
    setCameraRef(camRef.current);
    return () => setCameraRef(null);
  }, [camRef.current]);

  // Scene monitor
  useEffect(() => {
    if (settings.sceneMonitor && settings.camera.active && settings.apiKeys.gemini) {
      startSceneMonitor(settings.camera, settings.apiKeys.gemini);
    } else {
      stopSceneMonitor();
    }
    return () => stopSceneMonitor();
  }, [settings.sceneMonitor, settings.camera, settings.apiKeys.gemini]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [currentConversation?.messages, streamingText]);

  const messages = currentConversation?.messages ?? [];

  const stateColor =
    listeningState === 'active' ? COLORS.success
    : listeningState === 'processing' ? COLORS.warning
    : listeningState === 'passive' ? COLORS.accent
    : COLORS.textDim;

  const provider = activeProvider ? AI_PROVIDERS[activeProvider] : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Hidden camera for WiFi/phone capture */}
      {settings.camera.type === 'phone' && settings.camera.active && (
        <CameraView
          ref={camRef}
          style={styles.hiddenCamera}
          facing="back"
          onCameraReady={() => {
            if (!cameraPermission?.granted) requestCameraPermission();
          }}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>ZON</Text>
        <View style={styles.headerCenter}>
          <StatusIndicator state={listeningState} activeProvider={activeProvider} />
          {settings.ambientMode && ambientContext !== 'idle' && (
            <View style={styles.ambientChip}>
              <Ionicons name={getContextIcon(ambientContext) as any} color={COLORS.textMuted} size={11} />
              <Text style={styles.ambientLabel}>{getContextLabel(ambientContext)}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={newConversation} style={styles.iconBtn}>
          <Ionicons name="add-circle-outline" color={COLORS.textMuted} size={22} />
        </TouchableOpacity>
      </View>

      {/* Error */}
      {errorMessage && (
        <Pressable style={styles.errorBanner} onPress={() => setError(null)}>
          <Text style={styles.errorText} numberOfLines={2}>{errorMessage}</Text>
          <Ionicons name="close-circle" color={COLORS.danger} size={18} />
        </Pressable>
      )}

      {/* Proactive message banner */}
      {proactiveMessage && (
        <Pressable style={styles.proactiveBanner} onPress={() => setProactiveMessage(null)}>
          <Ionicons name="sparkles" color={COLORS.accent} size={14} />
          <Text style={styles.proactiveText} numberOfLines={2}>{proactiveMessage}</Text>
          <Ionicons name="close" color={COLORS.textDim} size={14} />
        </Pressable>
      )}

      {/* Agent progress indicator */}
      {agentProgress && (
        <View style={styles.agentProgressBar}>
          <View style={styles.agentProgressHeader}>
            <Ionicons name="git-network-outline" color={COLORS.warning} size={13} />
            <Text style={styles.agentProgressPhase}>
              {agentProgress.phase === 'planning' ? 'מתכנן...'
                : agentProgress.phase === 'executing' ? `מבצע ${agentProgress.completedTasks}/${agentProgress.totalTasks}`
                : agentProgress.phase === 'synthesizing' ? 'מסכם...'
                : 'סיים'}
            </Text>
          </View>
          {agentProgress.currentTask && (
            <Text style={styles.agentCurrentTask} numberOfLines={1}>{agentProgress.currentTask}</Text>
          )}
        </View>
      )}

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !streamingText && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>ZON</Text>
            <Text style={styles.emptyHint}>
              {listeningState === 'off'
                ? 'לחץ על הכדור להפעלה'
                : `אמור "${settings.wakeWord}" כדי לדבר`}
            </Text>
          </View>
        )}

        {messages.map((msg) => (
          <ConversationBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming bubble */}
        {streamingText.length > 0 && (
          <View style={[styles.streamBubble, { borderLeftColor: provider?.color ?? COLORS.accent }]}>
            {provider && (
              <Text style={[styles.streamProvider, { color: provider.color }]}>{provider.name}</Text>
            )}
            <Text style={styles.streamText}>{streamingText}</Text>
            <View style={styles.streamDots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { backgroundColor: provider?.color ?? COLORS.accent }]} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Live transcript */}
      {liveTranscript.length > 0 && (
        <View style={styles.liveBox}>
          <Text style={styles.liveText} numberOfLines={2}>{liveTranscript}</Text>
        </View>
      )}

      {/* Coaching tip overlay */}
      {coachingTip && settings.coachingMode && (
        <Pressable style={[styles.coachingTip, coachingTip.urgency === 'high' && styles.coachingTipHigh]}
          onPress={() => setCoachingTip(null)}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            color={coachingTip.urgency === 'high' ? COLORS.warning : COLORS.accent}
            size={14}
          />
          <Text style={styles.coachingTipText} numberOfLines={2}>{coachingTip.text}</Text>
        </Pressable>
      )}

      {/* Orb + Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleListening} activeOpacity={0.85}>
          <ZonOrb state={listeningState} size={140} />
        </TouchableOpacity>

        <Text style={[styles.stateLabel, { color: stateColor }]}>
          {listeningState === 'off' ? 'לחץ להפעלה'
            : listeningState === 'passive' ? `"${settings.wakeWord}" להפעיל`
            : listeningState === 'active' ? 'מקשיבה...'
            : 'מעבד...'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  hiddenCamera: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  logo: { fontSize: 22, fontWeight: '800', color: COLORS.accent, letterSpacing: 4 },
  iconBtn: { padding: 4 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: `${COLORS.danger}18`, borderLeftWidth: 3, borderLeftColor: COLORS.danger,
    paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 12, marginTop: 8, borderRadius: 8,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1, marginRight: 8 },

  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 12, paddingBottom: 4 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 36, fontWeight: '800', color: COLORS.textDim, letterSpacing: 6 },
  emptyHint: { fontSize: 14, color: COLORS.textDim, marginTop: 10 },

  streamBubble: {
    marginHorizontal: 12, marginVertical: 4,
    backgroundColor: COLORS.surface,
    borderLeftWidth: 2, borderRadius: 12, padding: 12,
  },
  streamProvider: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  streamText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  streamDots: { flexDirection: 'row', gap: 4, marginTop: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, opacity: 0.6 },

  liveBox: {
    backgroundColor: COLORS.surfaceHigh, marginHorizontal: 12, marginBottom: 6,
    padding: 10, borderRadius: 10, borderLeftWidth: 2, borderLeftColor: COLORS.accent,
  },
  liveText: { color: COLORS.textMuted, fontSize: 14, fontStyle: 'italic' },

  controls: { alignItems: 'center', paddingBottom: 16, paddingTop: 8, gap: 10 },
  stateLabel: { fontSize: 13, fontWeight: '500' },

  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  ambientChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  ambientLabel: { fontSize: 10, color: COLORS.textMuted },

  proactiveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${COLORS.accent}12`, paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  proactiveText: { flex: 1, color: COLORS.accent, fontSize: 13 },

  agentProgressBar: {
    backgroundColor: `${COLORS.warning}10`, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  agentProgressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agentProgressPhase: { fontSize: 12, color: COLORS.warning, fontWeight: '600' },
  agentCurrentTask: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  coachingTip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${COLORS.accent}14`,
    marginHorizontal: 12, marginBottom: 6,
    padding: 10, borderRadius: 10,
    borderLeftWidth: 2, borderLeftColor: COLORS.accent,
  },
  coachingTipHigh: {
    backgroundColor: `${COLORS.warning}14`,
    borderLeftColor: COLORS.warning,
  },
  coachingTipText: { flex: 1, color: COLORS.text, fontSize: 13 },
});
