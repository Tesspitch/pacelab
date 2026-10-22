import { DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Location from 'expo-location';
import { useEffect, useState, type PropsWithChildren } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppThemeProvider } from '@/components/app-theme';
import '@/lib/location-task';
import { supabase } from '@/lib/supabase';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    void Location.requestForegroundPermissionsAsync().then((result) => {
      if (result.granted && typeof window === 'undefined') void Location.requestBackgroundPermissionsAsync();
    }).catch(() => undefined);
  }, []);
  return <AppThemeProvider><AuthGate><RootNavigator /></AuthGate></AppThemeProvider>;
}

function AuthGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [ready, setReady] = useState(!supabase);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onLogin = pathname === '/login';
    if (signedIn && onLogin) router.replace('/');
  }, [pathname, ready, signedIn]);

  return <>{children}</>;
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
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
