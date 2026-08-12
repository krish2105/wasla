import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../lib/auth';

export default function AppLayout() {
  const { session } = useAuth();

  if (!session) return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
