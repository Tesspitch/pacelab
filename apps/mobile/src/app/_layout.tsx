import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#050816' },
          headerStyle: { backgroundColor: '#050816' },
          headerTintColor: '#F8FAFC',
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="free-run" options={{ title: 'Free Run' }} />
        <Stack.Screen name="workout-preview" options={{ title: 'Workout Preview' }} />
        <Stack.Screen name="interval-run" options={{ title: 'Speedwork', gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}
