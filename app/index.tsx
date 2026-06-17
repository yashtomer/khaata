import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useApp } from '../src/context';
import { C } from '../src/theme';

export default function Index() {
  const { hydrated, loggedIn } = useApp();
  // Wait for the persisted session to load, then route: signed in → dashboard,
  // otherwise → the login screen.
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <Redirect href={loggedIn ? '/(tabs)' : '/onboarding'} />;
}
