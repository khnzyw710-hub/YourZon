import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { Settings } from '@/store';
import { routeToAI } from '@/services/ai/router';
import { speakNow, stopTTS } from '@/services/ui/tts-controls';

export type VoiceCommandCategory =
  | 'navigation'
  | 'health'
  | 'finance'
  | 'productivity'
  | 'smart_home'
  | 'communication'
  | 'search'
  | 'settings'
  | 'unknown';

export interface ParsedVoiceCommand {
  category: VoiceCommandCategory;
  action: string;
  params: Record<string, any>;
  confidence: number;
  originalTranscript: string;
}

const COMMAND_PATTERNS: Array<{ pattern: RegExp; category: VoiceCommandCategory; action: string }> = [
  { pattern: /פתח|open|navigate|go to/i, category: 'navigation', action: 'open_screen' },
  { pattern: /שינה|sleep|ישנתי/i, category: 'health', action: 'log_sleep' },
  { pattern: /אכלתי|אכל|ate|food|eat/i, category: 'health', action: 'log_food' },
  { pattern: /הוצאה|spent|paid|expense|קניתי/i, category: 'finance', action: 'log_expense' },
  { pattern: /תזכורת|reminder|remind me/i, category: 'productivity', action: 'add_reminder' },
  { pattern: /משימה|task|add task/i, category: 'productivity', action: 'add_task' },
  { pattern: /אור|light|מנורה|fan|מאוורר/i, category: 'smart_home', action: 'control_device' },
  { pattern: /שלח|send|שלוח/i, category: 'communication', action: 'send_message' },
  { pattern: /חפש|search|find/i, category: 'search', action: 'search' },
  { pattern: /הגדרות|settings|שנה/i, category: 'settings', action: 'change_setting' },
];

export function useVoiceCommand() {
  const { settings } = useStore((s) => ({ settings: s.settings }));
  const [lastCommand, setLastCommand] = useState<ParsedVoiceCommand | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const parseCommand = useCallback(async (transcript: string): Promise<ParsedVoiceCommand> => {
    // Fast local pattern matching first
    for (const { pattern, category, action } of COMMAND_PATTERNS) {
      if (pattern.test(transcript)) {
        return {
          category,
          action,
          params: { rawText: transcript },
          confidence: 0.8,
          originalTranscript: transcript,
        };
      }
    }

    // AI parsing for complex commands
    const prompt = `Classify this voice command: "${transcript}"

Categories: navigation, health, finance, productivity, smart_home, communication, search, settings, unknown

Respond with JSON:
{
  "category": "category name",
  "action": "specific action (snake_case)",
  "params": {relevant extracted params},
  "confidence": 0.0-1.0
}`;

    try {
      const { response } = await routeToAI(prompt, [], settings);
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return { ...parsed, originalTranscript: transcript };
      }
    } catch {}

    return {
      category: 'unknown',
      action: 'general_query',
      params: { rawText: transcript },
      confidence: 0.3,
      originalTranscript: transcript,
    };
  }, [settings]);

  const processCommand = useCallback(async (transcript: string): Promise<ParsedVoiceCommand> => {
    setIsProcessing(true);
    try {
      const command = await parseCommand(transcript);
      setLastCommand(command);
      return command;
    } finally {
      setIsProcessing(false);
    }
  }, [parseCommand]);

  return { processCommand, lastCommand, isProcessing };
}
