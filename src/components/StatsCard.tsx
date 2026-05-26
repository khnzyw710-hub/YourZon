import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  icon?: string;
}

export default function StatsCard({ title, value, subtitle, color = Colors.primary, icon }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.top}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={[styles.value, { color }]}>{value}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    flex: 1,
    minWidth: 140,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
  },
  title: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
