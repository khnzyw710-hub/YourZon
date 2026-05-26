import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../constants/colors';
import DashboardScreen from '../screens/DashboardScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChatScreen = require('../screens/ChatScreen').default as React.ComponentType<any>;
import BusinessesScreen from '../screens/BusinessesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ConversationsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: 'חזור',
      }}
    >
      <Stack.Screen
        name="ConversationsList"
        component={ConversationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'שיחה' }}
      />
    </Stack.Navigator>
  );
}

const TAB_ICONS: Record<string, string> = {
  Dashboard: '📊',
  Conversations: '💬',
  Businesses: '🏢',
  Settings: '⚙️',
};

const TAB_LABELS: Record<string, string> = {
  Dashboard: 'לוח בקרה',
  Conversations: 'שיחות',
  Businesses: 'עסקים',
  Settings: 'הגדרות',
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
        tabBarLabel: ({ focused }) => (
          <Text style={{
            fontSize: 10,
            fontWeight: focused ? '700' : '400',
            color: focused ? Colors.primary : Colors.textMuted,
            marginBottom: 2,
          }}>
            {TAB_LABELS[route.name]}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.cardBorder,
          borderTopWidth: 1,
          height: 60,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Conversations" component={ConversationsStack} />
      <Tab.Screen name="Businesses" component={BusinessesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
