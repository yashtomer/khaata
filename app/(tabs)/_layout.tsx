import { Tabs } from 'expo-router';
import { Icon } from '../../components/Icon';
import { C, F } from '../../src/theme';

const HOME_PATHS = ['M3 9.5 12 3l9 6.5', 'M5 9.5V21h14V9.5'];
const STATS_PATHS = ['M3 21V3', 'M3 21h18', 'M7 16v-4', 'M12 16V8', 'M17 16v-9'];
const LIST_PATHS = ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'];
const WALLET_PATHS = ['M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M16 13h.01', 'M3 10h18'];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderTopColor: '#EEEEF4',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 18,
          paddingTop: 8,
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: '#A8A8BC',
        tabBarLabelStyle: { fontSize: 11, fontFamily: F.semiBold, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarActiveTintColor: C.primary,
          tabBarIcon: ({ color }) => <Icon paths={HOME_PATHS} color={color} size={23} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="spending"
        options={{
          title: 'Spending',
          tabBarIcon: ({ color }) => <Icon paths={STATS_PATHS} color={color} size={23} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <Icon paths={LIST_PATHS} color={color} size={23} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color }) => <Icon paths={WALLET_PATHS} color={color} size={23} strokeWidth={2.2} />,
        }}
      />
    </Tabs>
  );
}
