import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../src/lib/theme';

export default function ProviderLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="(dashboard)"
        options={{
          title: 'לוח בקרה',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="(calendar)"
        options={{
          title: 'יומן',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📅</Text>,
        }}
      />
      <Tabs.Screen
        name="(jobs)"
        options={{
          title: 'הזמנות',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>💼</Text>,
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          title: 'פרופיל',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
