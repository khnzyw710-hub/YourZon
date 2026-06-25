import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AIProvider, DEFAULT_WAKE_WORD, DEFAULT_STOP_WORD, MAX_CONTEXT_MESSAGES } from '@/constants';

export type ListeningState = 'off' | 'passive' | 'active' | 'processing';
export type Persona = 'auto' | 'business' | 'quick' | 'creative' | 'learning';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: AIProvider;
  timestamp: number;
  hasImage?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export interface CameraConfig {
  type: 'none' | 'phone' | 'wifi' | 'bluetooth';
  wifiUrl?: string;
  bluetoothId?: string;
  active: boolean;
}

export interface Settings {
  wakeWord: string;
  stopWord: string;
  preferredProvider: AIProvider | 'auto';
  smartRoute: boolean;
  raceMode: boolean;             // send to all providers, first wins
  ttsEnabled: boolean;
  ttsRate: number;
  ttsProvider: 'native' | 'elevenlabs';
  elevenLabsVoiceId: string;
  persona: Persona;
  camera: CameraConfig;
  sceneMonitor: boolean;         // continuous passive visual analysis
  porcupineKey: string;          // Picovoice access key
  apiKeys: {
    anthropic: string;
    openai: string;
    gemini: string;
    grok: string;
    elevenlabs: string;
  };
  proactive: {
    morningBriefing: boolean;
    morningHour: number;
    eveningBriefing: boolean;
    eveningHour: number;
    calendarReminders: boolean;
  };
}

interface ZonStore {
  listeningState: ListeningState;
  setListeningState: (s: ListeningState) => void;

  liveTranscript: string;
  setLiveTranscript: (t: string) => void;

  streamingText: string;
  setStreamingText: (t: string) => void;

  currentConversation: Conversation | null;
  conversations: Conversation[];
  addMessage: (msg: Message) => void;
  newConversation: () => void;
  clearHistory: () => void;

  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  updateApiKey: (provider: keyof Settings['apiKeys'], key: string) => Promise<void>;

  activeProvider: AIProvider | null;
  setActiveProvider: (p: AIProvider | null) => void;

  errorMessage: string | null;
  setError: (e: string | null) => void;

  micActive: boolean;
  setMicActive: (v: boolean) => void;

  loadSettings: () => Promise<void>;
}

const defaultSettings: Settings = {
  wakeWord: DEFAULT_WAKE_WORD,
  stopWord: DEFAULT_STOP_WORD,
  preferredProvider: 'auto',
  smartRoute: true,
  raceMode: false,
  ttsEnabled: true,
  ttsRate: 1.0,
  ttsProvider: 'native',
  elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  persona: 'auto',
  camera: { type: 'none', active: false },
  sceneMonitor: false,
  porcupineKey: '',
  apiKeys: {
    anthropic: '',
    openai: '',
    gemini: '',
    grok: '',
    elevenlabs: '',
  },
  proactive: {
    morningBriefing: false,
    morningHour: 7,
    eveningBriefing: false,
    eveningHour: 21,
    calendarReminders: true,
  },
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── SecureStore helpers ──────────────────────────────────────────────────────
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function saveSecureKey(name: string, value: string) {
  if (value) {
    await SecureStore.setItemAsync(`zon_key_${name}`, value, SECURE_OPTS);
  } else {
    await SecureStore.deleteItemAsync(`zon_key_${name}`).catch(() => {});
  }
}

async function loadSecureKeys(): Promise<Settings['apiKeys']> {
  const [anthropic, openai, gemini, grok, elevenlabs] = await Promise.all([
    SecureStore.getItemAsync('zon_key_anthropic', SECURE_OPTS).catch(() => ''),
    SecureStore.getItemAsync('zon_key_openai', SECURE_OPTS).catch(() => ''),
    SecureStore.getItemAsync('zon_key_gemini', SECURE_OPTS).catch(() => ''),
    SecureStore.getItemAsync('zon_key_grok', SECURE_OPTS).catch(() => ''),
    SecureStore.getItemAsync('zon_key_elevenlabs', SECURE_OPTS).catch(() => ''),
  ]);
  return {
    anthropic: anthropic ?? '',
    openai: openai ?? '',
    gemini: gemini ?? '',
    grok: grok ?? '',
    elevenlabs: elevenlabs ?? '',
  };
}

export const useZonStore = create<ZonStore>((set, get) => ({
  listeningState: 'off',
  setListeningState: (listeningState) => set({ listeningState }),

  liveTranscript: '',
  setLiveTranscript: (liveTranscript) => set({ liveTranscript }),

  streamingText: '',
  setStreamingText: (streamingText) => set({ streamingText }),

  currentConversation: null,
  conversations: [],

  addMessage: (msg) => {
    const { currentConversation, conversations } = get();
    if (!currentConversation) {
      const newConv: Conversation = {
        id: makeId(),
        title: msg.content.slice(0, 40),
        messages: [msg],
        createdAt: Date.now(),
      };
      set({ currentConversation: newConv, conversations: [newConv, ...conversations] });
    } else {
      const updated: Conversation = {
        ...currentConversation,
        messages: [...currentConversation.messages, msg].slice(-MAX_CONTEXT_MESSAGES * 2),
      };
      set({
        currentConversation: updated,
        conversations: conversations.map((c) => (c.id === updated.id ? updated : c)),
      });
    }
    AsyncStorage.setItem('conversations', JSON.stringify(get().conversations)).catch(() => {});
  },

  newConversation: () => set({ currentConversation: null, liveTranscript: '', streamingText: '' }),

  clearHistory: () => {
    set({ conversations: [], currentConversation: null });
    AsyncStorage.removeItem('conversations').catch(() => {});
  },

  settings: defaultSettings,

  updateSettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    const { apiKeys, ...rest } = settings;
    set({ settings });
    AsyncStorage.setItem('settings', JSON.stringify(rest)).catch(() => {});
  },

  updateApiKey: async (provider, key) => {
    await saveSecureKey(provider, key);
    set((state) => ({
      settings: {
        ...state.settings,
        apiKeys: { ...state.settings.apiKeys, [provider]: key },
      },
    }));
  },

  activeProvider: null,
  setActiveProvider: (activeProvider) => set({ activeProvider }),

  errorMessage: null,
  setError: (errorMessage) => set({ errorMessage }),

  micActive: false,
  setMicActive: (micActive) => set({ micActive }),

  loadSettings: async () => {
    try {
      const [settingsJson, convJson, apiKeys] = await Promise.all([
        AsyncStorage.getItem('settings'),
        AsyncStorage.getItem('conversations'),
        loadSecureKeys(),
      ]);

      const baseSettings = settingsJson
        ? { ...defaultSettings, ...JSON.parse(settingsJson), apiKeys }
        : { ...defaultSettings, apiKeys };

      set({ settings: baseSettings });

      if (convJson) {
        const convs: Conversation[] = JSON.parse(convJson);
        set({ conversations: convs, currentConversation: convs[0] ?? null });
      }
    } catch {}
  },
}));
