import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIProvider, DEFAULT_WAKE_WORD, DEFAULT_STOP_WORD, MAX_CONTEXT_MESSAGES } from '@/constants';

export type ListeningState = 'off' | 'passive' | 'active' | 'processing';

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
  wifiUrl?: string;        // e.g. http://192.168.1.100/stream
  bluetoothId?: string;    // BLE device id
  active: boolean;
}

export interface Settings {
  wakeWord: string;
  stopWord: string;
  preferredProvider: AIProvider | 'auto';
  smartRoute: boolean;     // auto-pick AI based on query type
  ttsEnabled: boolean;
  ttsRate: number;         // 0.5 - 2.0
  camera: CameraConfig;
  apiKeys: {
    anthropic: string;
    openai: string;
    gemini: string;
    grok: string;
  };
}

interface ZonStore {
  // Listening state
  listeningState: ListeningState;
  setListeningState: (s: ListeningState) => void;

  // Current transcript (live)
  liveTranscript: string;
  setLiveTranscript: (t: string) => void;

  // Conversations
  currentConversation: Conversation | null;
  conversations: Conversation[];
  addMessage: (msg: Message) => void;
  newConversation: () => void;
  clearHistory: () => void;

  // Settings
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  updateApiKey: (provider: keyof Settings['apiKeys'], key: string) => void;

  // UI state
  activeProvider: AIProvider | null;
  setActiveProvider: (p: AIProvider | null) => void;
  errorMessage: string | null;
  setError: (e: string | null) => void;

  // Init
  loadSettings: () => Promise<void>;
}

const defaultSettings: Settings = {
  wakeWord: DEFAULT_WAKE_WORD,
  stopWord: DEFAULT_STOP_WORD,
  preferredProvider: 'auto',
  smartRoute: true,
  ttsEnabled: true,
  ttsRate: 1.0,
  camera: { type: 'none', active: false },
  apiKeys: {
    anthropic: '',
    openai: '',
    gemini: '',
    grok: '',
  },
};

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export const useZonStore = create<ZonStore>((set, get) => ({
  listeningState: 'off',
  setListeningState: (listeningState) => set({ listeningState }),

  liveTranscript: '',
  setLiveTranscript: (liveTranscript) => set({ liveTranscript }),

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

  newConversation: () => set({ currentConversation: null, liveTranscript: '' }),

  clearHistory: () => {
    set({ conversations: [], currentConversation: null });
    AsyncStorage.removeItem('conversations').catch(() => {});
  },

  settings: defaultSettings,

  updateSettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    set({ settings });
    AsyncStorage.setItem('settings', JSON.stringify(settings)).catch(() => {});
  },

  updateApiKey: (provider, key) => {
    const settings = {
      ...get().settings,
      apiKeys: { ...get().settings.apiKeys, [provider]: key },
    };
    set({ settings });
    AsyncStorage.setItem('settings', JSON.stringify(settings)).catch(() => {});
  },

  activeProvider: null,
  setActiveProvider: (activeProvider) => set({ activeProvider }),

  errorMessage: null,
  setError: (errorMessage) => set({ errorMessage }),

  loadSettings: async () => {
    try {
      const [settingsJson, convJson] = await Promise.all([
        AsyncStorage.getItem('settings'),
        AsyncStorage.getItem('conversations'),
      ]);
      if (settingsJson) {
        set({ settings: { ...defaultSettings, ...JSON.parse(settingsJson) } });
      }
      if (convJson) {
        const convs: Conversation[] = JSON.parse(convJson);
        set({ conversations: convs, currentConversation: convs[0] ?? null });
      }
    } catch {}
  },
}));
