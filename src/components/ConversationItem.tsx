import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Conversation } from '../types';
import { Colors } from '../constants/colors';

interface Props {
  conversation: Conversation;
  onPress: () => void;
}

const TYPE_EMOJIS: Record<string, string> = {
  restaurant: '🍽️',
  beauty: '💅',
  fitness: '💪',
  law: '⚖️',
  accounting: '📊',
  retail: '🛍️',
  clinic: '🏥',
  real_estate: '🏠',
  education: '📚',
  hotel: '🏨',
  garage: '🔧',
  events: '🎉',
  services: '🔨',
  default: '🏢',
};

function formatTime(ts: number | undefined): string {
  if (!ts) return '';
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}ד'`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ש'`;
  return new Date(ts * 1000).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function ConversationItem({ conversation, onPress }: Props) {
  const emoji = TYPE_EMOJIS[conversation.business_type] || TYPE_EMOJIS.default;
  const hasResponse = conversation.inbound_count > 0;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>{emoji}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{conversation.business_name}</Text>
          <Text style={styles.time}>{formatTime(conversation.last_message_time)}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.preview} numberOfLines={1}>
            {conversation.last_message || 'אין הודעות'}
          </Text>
          {hasResponse && (
            <View style={styles.responseBadge}>
              <Text style={styles.responseText}>{conversation.inbound_count}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta}>{conversation.city} · {conversation.message_count} הודעות</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarEmoji: {
    fontSize: 22,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
    textAlign: 'right',
  },
  time: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  preview: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  responseBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  responseText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
  },
});
