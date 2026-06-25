import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, AI_PROVIDERS } from '@/constants';
import type { Message } from '@/store';

interface Props {
  message: Message;
}

export default function ConversationBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const provider = message.provider ? AI_PROVIDERS[message.provider] : null;
  const bubbleColor = isUser ? COLORS.surfaceHigh : COLORS.surface;
  const accentColor = provider?.color ?? COLORS.accent;

  return (
    <View style={[styles.wrapper, isUser && styles.wrapperUser]}>
      {!isUser && provider && (
        <Text style={[styles.providerLabel, { color: accentColor }]}>
          {provider.name}
        </Text>
      )}
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleColor },
          !isUser && { borderLeftColor: accentColor, borderLeftWidth: 2 },
          isUser && styles.bubbleUser,
        ]}
      >
        <Text style={[styles.text, isUser && styles.textUser]}>{message.content}</Text>
      </View>
      <Text style={styles.time}>
        {new Date(message.timestamp).toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    marginHorizontal: 12,
    alignItems: 'flex-start',
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  providerLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 12,
  },
  bubbleUser: {
    borderRadius: 12,
    borderBottomRightRadius: 4,
  },
  text: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
  },
  textUser: {
    color: COLORS.text,
  },
  time: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    marginHorizontal: 4,
  },
});
