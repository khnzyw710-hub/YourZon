import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (user?.role === 'provider' || user?.role === 'both') {
    return <Redirect href="/(provider)/(dashboard)" />;
  }

  return <Redirect href="/(customer)/(home)" />;
}
