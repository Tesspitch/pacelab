import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { Colors } from '@/constants/theme';
import { getInProgressSessions } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export function RunScreen({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const resumeOrStart = async () => {
    const active = (await getInProgressSessions())[0];
    if (active) {
      router.push({ pathname: active.mode === 'free_run' ? '/free-run' : '/interval-run', params: { sessionId: active.id } });
      return;
    }
    router.push('/run-start');
  };
  const openProfile = async () => {
    const session = await supabase?.auth.getSession();
    router.replace(session?.data.session ? '/profile' as never : '/login' as never);
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.screen}>{children}</View>
      </ScrollView>
      <View style={styles.dock}>
        <Pressable style={styles.dockItem} onPress={() => router.replace('/')}><Text style={[styles.dockIcon, pathname === '/' && styles.dockActive]}>⌂</Text><Text style={[styles.dockLabel, pathname === '/' && styles.dockActive]}>หน้าหลัก</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => router.replace('/history')}><Text style={[styles.dockIcon, pathname === '/history' && styles.dockActive]}>▤</Text><Text style={[styles.dockLabel, pathname === '/history' && styles.dockActive]}>ประวัติ</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.startDockButton} onPress={() => void resumeOrStart()}><Text style={styles.startDockIcon}>▶</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => void openProfile()}><Text style={[styles.dockIcon, pathname === '/profile' && styles.dockActive]}>◎</Text><Text style={[styles.dockLabel, pathname === '/profile' && styles.dockActive]}>โปรไฟล์</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => router.push('/settings')}><Text style={[styles.dockIcon, pathname === '/settings' && styles.dockActive]}>☰</Text><Text style={[styles.dockLabel, pathname === '/settings' && styles.dockActive]}>เมนู</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function ScreenTitle({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function BodyText({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Metric({ label, value, hero = false }: { label: string; value: string; hero?: boolean }) {
  return (
    <View style={[styles.metric, hero && styles.heroMetric]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, hero && styles.heroValue]}>{value}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' && styles.secondaryButton,
        tone === 'danger' && styles.dangerButton,
        (pressed || disabled) && styles.buttonMuted,
      ]}>
      <Text style={[styles.buttonText, tone === 'secondary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

export function ButtonRow({ children }: PropsWithChildren) {
  return <View style={styles.buttonRow}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.light.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 112 },
  screen: { width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1, gap: 18 },
  dock: { position: 'absolute', left: 12, right: 12, bottom: 10, height: 88, maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', backgroundColor: '#FFFFFF', borderColor: '#DCE5EC', borderWidth: 1, borderRadius: 0, paddingHorizontal: 8, shadowColor: '#1C2733', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  dockItem: { width: 68, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 5 },
  dockIcon: { color: '#6B7B8C', fontSize: 25, fontWeight: '900' },
  dockLabel: { color: '#6B7B8C', fontSize: 11, fontWeight: '900' },
  dockActive: { color: '#13AFA6' },
  startDockButton: { width: 72, height: 72, marginTop: -52, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#43C7B5', borderColor: '#FFFFFF', borderWidth: 6, shadowColor: '#159E9A', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  startDockIcon: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginLeft: 3 },
  eyebrow: { color: '#38AFA1', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: '#191D23', fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: '#667282', fontSize: 16, lineHeight: 24 },
  metric: { flex: 1, minWidth: 140, minHeight: 108, borderRadius: 0, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, padding: 18, gap: 8, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  heroMetric: { minHeight: 190, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5F5F1', borderColor: '#D6EEE8' },
  metricLabel: { color: '#697584', fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  metricValue: { color: '#191D23', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroValue: { fontSize: 56 },
  button: { minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 0, backgroundColor: '#43C7B5', paddingHorizontal: 18 },
  secondaryButton: { borderColor: '#DDE4EA', borderWidth: 1, backgroundColor: '#FFFFFF' },
  dangerButton: { backgroundColor: '#E66D6D' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#14202B', fontSize: 16, fontWeight: '900' },
  secondaryButtonText: { color: '#303945' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
