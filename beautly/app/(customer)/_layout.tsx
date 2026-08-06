import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../src/lib/theme';

export default function CustomerLayout() {
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
        name="(home)"
        options={{
          title: 'בית',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="(bookings)"
        options={{
          title: 'הזמנות',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="(favorites)"
        options={{
          title: 'מועדפים',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>❤️</Text>,
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
