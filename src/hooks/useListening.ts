import { useCallback, useRef, useEffect } from 'react';
import { useZonStore } from '@/store';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  isRecognitionRunning,
} from '@/services/speech/recognition';
import { speak, stopSpeaking, isSpeaking } from '@/services/speech/synthesis';
import { routeToAIStream } from '@/services/ai/router';
import { consumeStream } from '@/services/ai/streaming';
import { captureFrame, getSceneContext } from '@/services/camera';
import { recognizeText, hasSignificantText, buildOCRContextPrompt } from '@/services/camera/ocr';
import { learnFromExchange } from '@/services/memory';
import { matchTrigger } from '@/services/triggers';
import { executeTool, parseToolCall, TOOL_MANIFEST } from '@/services/agent/tools';
import { HapticPattern } from '@/services/haptics';
import { detectLanguage } from '@/services/language/detection';
import { isClipboardQuery, getClipboardText } from '@/services/integrations/clipboard';
import { SILENCE_TIMEOUT_MS, PERSONA_SYSTEM_ADDONS } from '@/constants';

export function useListening() {
  const {
    listeningState,
    setListeningState,
    setLiveTranscript,
    setStreamingText,
    settings,
    addMessage,
    currentConversation,
    setActiveProvider,
    setError,
    setMicActive,
  } = useZonStore();

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBuffer = useRef('');
  const isActive = useRef(false);
  // Ref so resetSilenceTimer always calls the latest submitQuery without becoming a dep
  const submitQueryRef = useRef<(query: string) => Promise<void>>(async () => {});

  const resetSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimer.current!);
    silenceTimer.current = setTimeout(() => {
      if (isActive.current) submitQueryRef.current(activeBuffer.current.trim());
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const submitQuery = useCallback(
    async (rawQuery: string) => {
      if (!rawQuery || rawQuery.length < 2) return;

      isActive.current = false;
      activeBuffer.current = '';
      setListeningState('processing');
      setLiveTranscript('');
      setStreamingText('');

      // Check custom triggers first
      const trigger = await matchTrigger(rawQuery);
      if (trigger) {
        await HapticPattern.triggerMatch();
        if (trigger.action.type === 'ai_query') {
          await submitQuery(trigger.action.prompt);
          return;
        }
        const result = await executeTool({
          name: trigger.action.type as any,
          args: trigger.action as any,
        });
        addMessage({ id: makeId(), role: 'user', content: rawQuery, timestamp: Date.now() });
        addMessage({ id: makeId(), role: 'assistant', content: result.output, timestamp: Date.now() });
        if (settings.ttsEnabled) {
          await speak(result.output, settings.ttsRate, () => setListeningState('passive'),
            settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined,
            settings.elevenLabsVoiceId
          );
        } else {
          setListeningState('passive');
        }
        return;
      }

      // Build context
      let query = rawQuery;
      let imageBase64: string | undefined;

      // Camera frame
      const frame = await captureFrame(settings.camera);
      if (frame) {
        imageBase64 = frame;
        // Also try OCR
        const ocr = await recognizeText(frame);
        if (hasSignificantText(ocr)) {
          query = buildOCRContextPrompt(ocr.text, rawQuery);
        }
      }

      // Clipboard context
      if (isClipboardQuery(rawQuery)) {
        const clipText = await getClipboardText();
        if (clipText) query = `${rawQuery}\nClipboard: "${clipText}"`;
      }

      // Scene context (passive visual monitor)
      const scene = getSceneContext();
      if (scene && !frame) {
        query = `[Visual context: ${scene}]\n${query}`;
      }

      // Persona addon
      const personaAddon = PERSONA_SYSTEM_ADDONS[settings.persona] ?? '';
      if (personaAddon) query = `[Tone: ${personaAddon}]\n${query}`;

      addMessage({ id: makeId(), role: 'user', content: rawQuery, timestamp: Date.now() });

      try {
        const messages = currentConversation?.messages ?? [];
        const { stream, provider } = await routeToAIStream(query, messages, settings, imageBase64);

        setActiveProvider(provider);
        await HapticPattern.processingStarted();

        let fullResponse = '';

        await consumeStream(
          stream,
          (text) => setStreamingText(text),
          async (sentence) => {
            if (!settings.ttsEnabled) return;
            await new Promise<void>((resolve) => {
              speak(
                sentence,
                settings.ttsRate,
                resolve,
                settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined,
                settings.elevenLabsVoiceId
              );
            });
          },
          async (full) => {
            fullResponse = full;

            // Check if AI wants to call a tool
            const toolCall = parseToolCall(full);
            if (toolCall) {
              const result = await executeTool(toolCall);
              if (!result.success || full.includes(result.output)) {
                // already spoken
              } else {
                await speak(
                  result.output,
                  settings.ttsRate,
                  undefined,
                  settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined
                );
              }
            }

            addMessage({
              id: makeId(),
              role: 'assistant',
              content: full,
              provider,
              timestamp: Date.now(),
              hasImage: !!imageBase64,
            });

            await learnFromExchange(rawQuery, full);
            await HapticPattern.responseArrived();
            setStreamingText('');
            setActiveProvider(null);
            setListeningState('passive');
          }
        );
      } catch (err: any) {
        await HapticPattern.error();
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

  // Keep ref current so resetSilenceTimer always has the latest submitQuery
  submitQueryRef.current = submitQuery;

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      setLiveTranscript(transcript);

      const lower = transcript.toLowerCase();
      const wake = settings.wakeWord.toLowerCase();
      const stop = settings.stopWord.toLowerCase();

      if (lower.includes(stop) && isActive.current) {
        clearTimeout(silenceTimer.current!);
        stopSpeaking();
        isActive.current = false;
        activeBuffer.current = '';
        HapticPattern.stopWordDetected();
        setListeningState('passive');
        setLiveTranscript('');
        return;
      }

      if (!isActive.current) {
        if (lower.includes(wake)) {
          isActive.current = true;
          setListeningState('active');
          HapticPattern.wakeWordDetected();
          const after = transcript.slice(lower.indexOf(wake) + wake.length).trim();
          activeBuffer.current = after;
          if (after) resetSilenceTimer();
        }
      } else {
        activeBuffer.current = transcript;
        resetSilenceTimer();
      }
    },
    [settings.wakeWord, settings.stopWord, resetSilenceTimer]
  );

  const startListening = useCallback(async () => {
    if (isRecognitionRunning()) return;
    setListeningState('passive');
    setMicActive(true);
    await startContinuousRecognition(handleTranscript, (err) => {
      console.warn('[Zon] Recognition error:', err);
    }, 'he-IL');
  }, [handleTranscript]);

  const stopListening = useCallback(() => {
    stopContinuousRecognition();
    clearTimeout(silenceTimer.current!);
    isActive.current = false;
    activeBuffer.current = '';
    setListeningState('off');
    setMicActive(false);
    setLiveTranscript('');
    setStreamingText('');
  }, []);

  const toggleListening = useCallback(() => {
    if (listeningState === 'off') startListening();
    else stopListening();
  }, [listeningState, startListening, stopListening]);

  return { listeningState, toggleListening, startListening, stopListening };
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
