import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppThemeProvider } from '@/components/app-theme';
import '@/lib/location-task';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => { if (typeof window === 'undefined') { void Location.requestForegroundPermissionsAsync().then((result) => { if (result.granted) void Location.requestBackgroundPermissionsAsync(); }); } }, []);
  return <AppThemeProvider><RootNavigator /></AppThemeProvider>;
}

function RootNavigator() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#F1F4F8' },
          headerStyle: { backgroundColor: '#F1F4F8' },
          headerTintColor: '#191D23',
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="run-start" options={{ title: 'เริ่มกิจกรรม' }} />
        <Stack.Screen name="free-run" options={{ title: 'Run' }} />
        <Stack.Screen name="workout-preview" options={{ title: 'Workout Preview' }} />
        <Stack.Screen name="workout-builder" options={{ title: 'สร้าง Interval' }} />
        <Stack.Screen name="interval-run" options={{ title: 'Speedwork', gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ title: 'การตั้งค่า' }} />
        <Stack.Screen name="activity/[id]" options={{ title: 'กิจกรรม' }} />
      </Stack>
    </ThemeProvider>
  );
}
