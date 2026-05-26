import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../types';
import { Colors } from '../constants/colors';

interface Props {
  message: Message;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'read': return '✓✓';
    case 'delivered': return '✓✓';
    case 'sent': return '✓';
    default: return '⏳';
  }
}

function getAIBadge(model: string | null): { label: string; color: string } | null {
  if (model === 'gemini') return { label: 'Gemini', color: Colors.gemini };
  if (model === 'claude') return { label: 'Claude', color: Colors.claude };
  return null;
}

export default function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === 'outbound';
  const aiBadge = getAIBadge(message.ai_model);

  return (
    <View style={[styles.container, isOutbound ? styles.outboundContainer : styles.inboundContainer]}>
      {aiBadge && (
        <View style={[styles.aiBadge, { backgroundColor: aiBadge.color + '30', borderColor: aiBadge.color + '60' }]}>
          <Text style={[styles.aiBadgeText, { color: aiBadge.color }]}>{aiBadge.label} AI</Text>
        </View>
      )}
      <View style={[styles.bubble, isOutbound ? styles.outboundBubble : styles.inboundBubble]}>
        <Text style={styles.content}>{message.content}</Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{formatTime(message.timestamp)}</Text>
          {isOutbound && (
            <Text style={[styles.status, message.status === 'read' ? styles.statusRead : null]}>
              {' '}{getStatusIcon(message.status)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  outboundContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  inboundContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  aiBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
  },
  outboundBubble: {
    backgroundColor: Colors.outbound,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: Colors.primaryDark + '40',
  },
  inboundBubble: {
    backgroundColor: Colors.inbound,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  content: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  time: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  status: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  statusRead: {
    color: Colors.primary,
  },
});
