import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import MessageBubble from '../components/MessageBubble';
import { Conversation, Message, ConversationStage } from '../types';

interface Props {
  route: { params: { conversationId: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
}

const STAGES: Array<{ key: ConversationStage; label: string; color: string }> = [
  { key: 'outreach', label: 'פנייה', color: Colors.textMuted },
  { key: 'interested', label: 'מתעניין', color: Colors.gemini },
  { key: 'meeting', label: 'פגישה', color: Colors.warning },
  { key: 'closed', label: 'נסגר', color: Colors.primary },
  { key: 'not_interested', label: 'לא מעוניין', color: Colors.danger },
];

export default function ChatScreen({ route, navigation }: Props) {
  const { conversationId } = route.params;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getConversation(conversationId);
      setConversation(data);
      setMessages(data.messages || []);
      navigation.setOptions({ title: data.business_name });
    } catch {
      // ignore
    }
  }, [conversationId, navigation]);

  useSocket({
    'message:new': (data: unknown) => {
      const msg = data as Message & { business?: { id: string } };
      if (msg.conversation_id === conversationId) {
        setMessages((prev) => [...prev, msg]);
      }
    },
    'message:sent': (data: unknown) => {
      const msg = data as Message;
      if (msg.conversation_id === conversationId) {
        setMessages((prev) => {
          const exists = prev.find((m) => m.id === msg.id);
          if (exists) return prev;
          return [...prev, msg];
        });
      }
    },
    'message:ack': (data: unknown) => {
      const d = data as { whatsapp_id: string; status: string };
      setMessages((prev) =>
        prev.map((m) => (m.whatsapp_id === d.whatsapp_id ? { ...m, status: d.status } : m))
      );
    },
  });

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    try {
      await api.sendMessage(conversationId, text);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, sending, conversationId]);

  const handleStageChange = useCallback(async (stage: ConversationStage) => {
    try {
      await api.updateStage(conversationId, stage);
      setConversation((prev) => prev ? { ...prev, stage } : prev);
    } catch {
      // ignore
    }
  }, [conversationId]);

  if (!conversation) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const currentStage = STAGES.find((s) => s.key === conversation.stage) || STAGES[0];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.convHeader}>
        <View style={styles.convInfo}>
          <Text style={styles.convName}>{conversation.business_name}</Text>
          <Text style={styles.convMeta}>{conversation.city} · {conversation.business_type}</Text>
        </View>
        <View style={[styles.stageBadge, { backgroundColor: currentStage.color + '20', borderColor: currentStage.color + '50' }]}>
          <Text style={[styles.stageText, { color: currentStage.color }]}>{currentStage.label}</Text>
        </View>
      </View>

      <View style={styles.stageRow}>
        {STAGES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.stageBtn, conversation.stage === s.key && { backgroundColor: s.color + '20', borderColor: s.color }]}
            onPress={() => handleStageChange(s.key)}
          >
            <Text style={[styles.stageBtnText, { color: conversation.stage === s.key ? s.color : Colors.textMuted }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>אין הודעות עדיין</Text>
          </View>
        }
      />

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.sendBtnText}>שלח</Text>
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="כתוב הודעה..."
          placeholderTextColor={Colors.textMuted}
          multiline
          textAlign="right"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  convInfo: { flex: 1 },
  convName: { color: Colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  convMeta: { color: Colors.textMuted, fontSize: 12, textAlign: 'right' },
  stageBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  stageText: { fontSize: 12, fontWeight: '600' },
  stageRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexWrap: 'wrap',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  stageBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  stageBtnText: { fontSize: 11, fontWeight: '500' },
  messageList: { padding: 12, paddingBottom: 8 },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: Colors.textMuted },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
});
