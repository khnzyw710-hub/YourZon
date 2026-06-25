import { useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useZonStore } from '@/store';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  isRecognitionRunning,
} from '@/services/speech/recognition';
import { speak, stopSpeaking, isSpeaking } from '@/services/speech/synthesis';
import { routeToAI } from '@/services/ai/router';
import { captureFrame } from '@/services/camera';
import { SILENCE_TIMEOUT_MS } from '@/constants';

export function useListening() {
  const {
    listeningState,
    setListeningState,
    setLiveTranscript,
    liveTranscript,
    settings,
    addMessage,
    currentConversation,
    setActiveProvider,
    setError,
  } = useZonStore();

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeQueryBuffer = useRef('');
  const isActiveMode = useRef(false);

  const resetSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimer.current!);
    silenceTimer.current = setTimeout(() => {
      if (isActiveMode.current) {
        submitQuery(activeQueryBuffer.current.trim());
      }
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const submitQuery = useCallback(
    async (query: string) => {
      if (!query) return;

      isActiveMode.current = false;
      activeQueryBuffer.current = '';
      setListeningState('processing');
      setLiveTranscript('');

      // Save user message
      addMessage({
        id: Date.now().toString(36),
        role: 'user',
        content: query,
        timestamp: Date.now(),
      });

      try {
        // Optionally capture camera frame
        const imageBase64 = await captureFrame(settings.camera);

        const messages = currentConversation?.messages ?? [];
        const { response, provider } = await routeToAI(query, messages, settings, imageBase64 ?? undefined);

        setActiveProvider(provider);

        addMessage({
          id: (Date.now() + 1).toString(36),
          role: 'assistant',
          content: response,
          provider,
          timestamp: Date.now(),
          hasImage: !!imageBase64,
        });

        if (settings.ttsEnabled) {
          await speak(response, settings.ttsRate, () => {
            setActiveProvider(null);
            setListeningState('passive');
          });
        } else {
          setActiveProvider(null);
          setListeningState('passive');
        }
      } catch (err: any) {
        const msg =
          err?.message === 'no_api_keys'
            ? 'אין מפתחות API. הגדר אותם בהגדרות.'
            : `שגיאה: ${err?.message ?? 'unknown'}`;
        setError(msg);
        setListeningState('passive');
      }
    },
    [settings, currentConversation]
  );

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      setLiveTranscript(transcript);

      const lower = transcript.toLowerCase();
      const wake = settings.wakeWord.toLowerCase();
      const stop = settings.stopWord.toLowerCase();

      // Check stop word (works even during active mode)
      if (lower.includes(stop) && isActiveMode.current) {
        clearTimeout(silenceTimer.current!);
        if (isSpeaking()) {
          stopSpeaking();
        }
        isActiveMode.current = false;
        activeQueryBuffer.current = '';
        setListeningState('passive');
        setLiveTranscript('');
        return;
      }

      if (!isActiveMode.current) {
        // Passive mode — watch for wake word
        if (lower.includes(wake)) {
          isActiveMode.current = true;
          setListeningState('active');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // Strip the wake word from the transcript
          const after = transcript.slice(lower.indexOf(wake) + wake.length).trim();
          activeQueryBuffer.current = after;
          if (after) resetSilenceTimer();
        }
      } else {
        // Active mode — accumulate transcript
        activeQueryBuffer.current = transcript;
        resetSilenceTimer();
      }
    },
    [settings.wakeWord, settings.stopWord, resetSilenceTimer]
  );

  const startListening = useCallback(async () => {
    if (isRecognitionRunning()) return;
    setListeningState('passive');
    await startContinuousRecognition(
      handleTranscript,
      (err) => {
        console.warn('Recognition error:', err);
      },
      'he-IL'
    );
  }, [handleTranscript]);

  const stopListening = useCallback(() => {
    stopContinuousRecognition();
    clearTimeout(silenceTimer.current!);
    isActiveMode.current = false;
    activeQueryBuffer.current = '';
    setListeningState('off');
    setLiveTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (listeningState === 'off') {
      startListening();
    } else {
      stopListening();
    }
  }, [listeningState, startListening, stopListening]);

  return {
    listeningState,
    liveTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
