import { useCallback, useRef, useEffect } from 'react';
import { useZonStore } from '@/store';
import {
  startContinuousRecognition,
  stopContinuousRecognition,
  isRecognitionRunning,
} from '@/services/speech/recognition';
import { speak, stopSpeaking } from '@/services/speech/synthesis';
import { routeToAIStream } from '@/services/ai/router';
import { consumeStream } from '@/services/ai/streaming';
import { captureFrame, getSceneContext } from '@/services/camera';
import { recognizeText, hasSignificantText, buildOCRContextPrompt } from '@/services/camera/ocr';
import { learnFromExchange, setEmbeddingApiKeys } from '@/services/memory';
import { matchTrigger } from '@/services/triggers';
import { executeTool, parseToolCall, TOOL_MANIFEST } from '@/services/agent/tools';
import { HapticPattern } from '@/services/haptics';
import { detectLanguage } from '@/services/language/detection';
import { feedTranscript, setLangChangeCallback, getCurrentLang } from '@/services/language/auto';
import { isClipboardQuery, getClipboardText } from '@/services/integrations/clipboard';
import { SILENCE_TIMEOUT_MS, PERSONA_SYSTEM_ADDONS } from '@/constants';
import { recordConversation, generateDailyJournal } from '@/services/chronicle';
import { isComplexTask, runMultiAgent } from '@/services/agent/multi-agent';
import { processCoachingTranscript, isCoachingActive } from '@/services/coaching';
import { onVoiceStart, onEarlyWords, getPrefetchedContext, refreshMemoryForQuery } from '@/services/predictive/prefetch';
import { buildSpatialContextString } from '@/services/biometric';
import { learnFromText as knowledgeLearn } from '@/services/knowledge/graph';
import { detectAndSaveCommitments, buildCommitmentsContextString } from '@/services/commitments';
import { analyzeEmotion, getEmotionSystemPrompt } from '@/services/emotion';
import { detectFocusCommand, startFocus, stopFocus, isFocusing } from '@/services/focus';
import { triggerNightlyConsolidation } from '@/services/memory/consolidation';
import { feedPassiveTranscript, startPassiveMode, stopPassiveMode, isPassiveActive } from '@/services/passive';
import { buildLifeContextString, startLifeTracking } from '@/services/lifetracker';
import { buildMegaContext } from '@/services/jarvis/mega-context';
import { startPorcupine, stopPorcupine, hasPorcupineKey } from '@/services/wakeword/porcupine';

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
    setAgentProgress,
    setCoachingTip,
  } = useZonStore();

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeBuffer = useRef('');
  const isActive = useRef(false);
  const submitQueryRef = useRef<(query: string) => Promise<void>>(async () => {});

  // Keep embedding API keys synced
  useEffect(() => {
    setEmbeddingApiKeys({
      openai: settings.apiKeys.openai,
      gemini: settings.apiKeys.gemini,
    });
  }, [settings.apiKeys.openai, settings.apiKeys.gemini]);

  // Passive mode lifecycle
  useEffect(() => {
    if (settings.passiveMode) {
      startPassiveMode();
    } else if (isPassiveActive()) {
      stopPassiveMode();
    }
  }, [settings.passiveMode]);

  // Life tracking lifecycle
  useEffect(() => {
    if (settings.lifeTracking) {
      startLifeTracking().catch(() => {});
    }
  }, [settings.lifeTracking]);

  // Porcupine on-device wake word (when access key is configured)
  useEffect(() => {
    if (!hasPorcupineKey(settings.porcupineKey)) return;

    startPorcupine(
      settings.porcupineKey,
      () => {
        if (isActive.current) return; // already active
        isActive.current = true;
        setListeningState('active');
        HapticPattern.wakeWordDetected();
        if (settings.predictiveMode) onVoiceStart();
      },
      (err) => console.warn('[Porcupine]', err)
    );

    return () => { stopPorcupine(); };
  }, [settings.porcupineKey]);

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
          await submitQueryRef.current(trigger.action.prompt);
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
            settings.elevenLabsVoiceId,
            settings.ttsProvider === 'openai' ? settings.apiKeys.openai : undefined,
            settings.openaiTtsVoice
          );
        } else {
          setListeningState('passive');
        }
        return;
      }

      // ── Multi-agent routing for complex tasks ──────────────────────────────
      if (settings.multiAgentEnabled && isComplexTask(rawQuery)) {
        addMessage({ id: makeId(), role: 'user', content: rawQuery, timestamp: Date.now() });
        await HapticPattern.processingStarted();

        await runMultiAgent(
          rawQuery,
          settings,
          (progress) => setAgentProgress(progress),
          (text) => setStreamingText(text),
          async (fullText) => {
            addMessage({
              id: makeId(), role: 'assistant', content: fullText,
              timestamp: Date.now(),
            });
            setAgentProgress(null);
            setStreamingText('');
            if (settings.ttsEnabled) {
              speak(fullText, settings.ttsRate, () => setListeningState('passive'),
                settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined,
                settings.elevenLabsVoiceId,
                settings.ttsProvider === 'openai' ? settings.apiKeys.openai : undefined,
                settings.openaiTtsVoice
              );
            } else {
              setListeningState('passive');
            }
            await recordConversation(rawQuery, fullText);
            await learnFromExchange(rawQuery, fullText);
          }
        );
        return;
      }

      // ── Standard AI query ──────────────────────────────────────────────────
      let query = rawQuery;
      let imageBase64: string | undefined;

      // Build JARVIS mega-context (persona, profile, temporal, memory, life stats)
      const megaContext = await buildMegaContext(rawQuery, settings).catch(() => ({
        systemPrompt: '',
        contextInjection: '',
        estimatedTokens: 0,
      }));

      // Get pre-fetched context (likely already loaded from onVoiceStart)
      const prefetched = await getPrefetchedContext();

      // Camera frame
      const frame = await captureFrame(settings.camera);
      if (frame) {
        imageBase64 = frame;
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

      // Scene context
      const scene = getSceneContext();
      if (scene && !frame) {
        query = `[Visual context: ${scene}]\n${query}`;
      }

      // Spatial context (if enabled)
      if (settings.spatialContext) {
        const spatial = await buildSpatialContextString().catch(() => '');
        if (spatial) query = `[${spatial}]\n${query}`;
      }

      // Life tracking context (steps, calories, places visited today)
      if (settings.lifeTracking) {
        const lifeCtx = await buildLifeContextString().catch(() => '');
        if (lifeCtx) query = `${lifeCtx}\n${query}`;
      }

      // Calendar context from prefetch
      if (prefetched.calendarContext) {
        query = `[${prefetched.calendarContext}]\n${query}`;
      }

      // Persona addon
      const personaAddon = PERSONA_SYSTEM_ADDONS[settings.persona] ?? '';
      if (personaAddon) query = `[Tone: ${personaAddon}]\n${query}`;

      // Emotion-adaptive tone
      if (settings.emotionAdaptor) {
        const emotionAnalysis = analyzeEmotion(rawQuery);
        const emotionPrompt = getEmotionSystemPrompt(emotionAnalysis.state);
        if (emotionPrompt) query = `[${emotionPrompt}]\n${query}`;
      }

      // Pending commitments context
      const commitmentsCtx = await buildCommitmentsContextString().catch(() => '');
      if (commitmentsCtx) query = `${commitmentsCtx}\n${query}`;

      // Inject JARVIS context into the query (location, calendar, life stats, memory)
      if (megaContext.contextInjection) {
        query = `${megaContext.contextInjection}\n\n${query}`;
      }

      addMessage({ id: makeId(), role: 'user', content: rawQuery, timestamp: Date.now() });

      try {
        const messages = currentConversation?.messages ?? [];

        // Use prefetched memory or refresh for specific query
        const memory = prefetched.memoryContext || await refreshMemoryForQuery(rawQuery);

        // Inject TOOL_MANIFEST into query for agent-capable models
        const augmentedQuery = `${query}\n\n${TOOL_MANIFEST}`;

        const { stream, provider } = await routeToAIStream(
          augmentedQuery, messages, settings, imageBase64,
          megaContext.systemPrompt || undefined
        );

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
                sentence, settings.ttsRate, resolve,
                settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined,
                settings.elevenLabsVoiceId,
                settings.ttsProvider === 'openai' ? settings.apiKeys.openai : undefined,
                settings.openaiTtsVoice
              );
            });
          },
          async (full) => {
            fullResponse = full;

            // Tool call detection
            const toolCall = parseToolCall(full);
            if (toolCall) {
              const result = await executeTool(toolCall);
              if (result.success && !full.includes(result.output)) {
                await speak(
                  result.output, settings.ttsRate, undefined,
                  settings.ttsProvider === 'elevenlabs' ? settings.apiKeys.elevenlabs : undefined,
                  settings.elevenLabsVoiceId,
                  settings.ttsProvider === 'openai' ? settings.apiKeys.openai : undefined,
                  settings.openaiTtsVoice
                );
              }
            }

            addMessage({
              id: makeId(), role: 'assistant', content: full,
              provider, timestamp: Date.now(), hasImage: !!imageBase64,
            });

            await Promise.all([
              learnFromExchange(rawQuery, full),
              settings.chronicleEnabled ? recordConversation(rawQuery, full, provider) : Promise.resolve(),
              settings.knowledgeGraph ? knowledgeLearn(rawQuery, full) : Promise.resolve(),
              detectAndSaveCommitments(rawQuery, full),
            ]);

            await HapticPattern.responseArrived();
            setStreamingText('');
            setActiveProvider(null);
            setListeningState('passive');

            // Generate journal + nightly consolidation (async, non-blocking)
            if (settings.chronicleEnabled) {
              generateDailyJournal(settings).catch(() => {});
            }
            triggerNightlyConsolidation(settings).catch(() => {});
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

  submitQueryRef.current = submitQuery;

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      setLiveTranscript(transcript);

      const lower = transcript.toLowerCase();
      const wake = settings.wakeWord.toLowerCase();
      const stop = settings.stopWord.toLowerCase();

      // Language auto-detection
      feedTranscript(transcript);

      // Passive recorder — feed every transcript when enabled
      if (settings.passiveMode) {
        feedPassiveTranscript(transcript, !isActive.current);
      }

      // Coaching mode — process every transcript
      if (isCoachingActive()) {
        processCoachingTranscript(transcript, isActive.current);
      }

      // Focus command detection (always active)
      if (isActive.current) {
        const focusCmd = detectFocusCommand(transcript);
        if (focusCmd.action === 'start') {
          startFocus(focusCmd.goal).catch(() => {});
        } else if (focusCmd.action === 'stop') {
          stopFocus('voice command').catch(() => {});
        }
      }

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

          // Trigger predictive prefetch immediately on wake word
          if (settings.predictiveMode) {
            onVoiceStart();
          }

          const after = transcript.slice(lower.indexOf(wake) + wake.length).trim();
          activeBuffer.current = after;
          if (after) {
            if (settings.predictiveMode) onEarlyWords(after);
            resetSilenceTimer();
          }
        }
      } else {
        activeBuffer.current = transcript;
        // Feed early words to predictive engine
        if (settings.predictiveMode && transcript.split(/\s+/).length >= 3) {
          onEarlyWords(transcript);
        }
        resetSilenceTimer();
      }
    },
    [settings.wakeWord, settings.stopWord, settings.predictiveMode, resetSilenceTimer]
  );

  const startListening = useCallback(async () => {
    if (isRecognitionRunning()) return;
    setListeningState('passive');
    setMicActive(true);
    const locale = getCurrentLang() === 'en-US' ? 'en-US' : 'he-IL';
    await startContinuousRecognition(handleTranscript, (err) => {
      console.warn('[Zon] Recognition error:', err);
    }, locale);
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
