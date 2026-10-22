import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { Colors } from '@/constants/theme';
import { getInProgressSessions } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export function RunScreen({ children, hideDock = false, fillScreen = false }: PropsWithChildren<{ hideDock?: boolean; fillScreen?: boolean }>) {
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
      <ScrollView style={fillScreen && styles.fillScroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, hideDock && { paddingBottom: 28 }, fillScreen && styles.fillScrollContent]}>
        <View style={[styles.screen, fillScreen && styles.fillScreen]}>{children}</View>
      </ScrollView>
      {!hideDock && <View style={styles.dock}>
        <Pressable style={styles.dockItem} onPress={() => router.replace('/')}><Text style={[styles.dockIcon, pathname === '/' && styles.dockActive]}>⌂</Text><Text style={[styles.dockLabel, pathname === '/' && styles.dockActive]}>หน้าหลัก</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => router.replace('/history')}><Text style={[styles.dockIcon, pathname === '/history' && styles.dockActive]}>▤</Text><Text style={[styles.dockLabel, pathname === '/history' && styles.dockActive]}>ประวัติ</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="เลือกการวิ่ง หรือกลับไปวิ่งต่อ" style={styles.startDockButton} onPress={() => void resumeOrStart()}><Text style={styles.startDockIcon}>▶</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => void openProfile()}><Text style={[styles.dockIcon, pathname === '/profile' && styles.dockActive]}>◎</Text><Text style={[styles.dockLabel, pathname === '/profile' && styles.dockActive]}>โปรไฟล์</Text></Pressable>
        <Pressable style={styles.dockItem} onPress={() => router.push('/settings')}><Text style={[styles.dockIcon, pathname === '/settings' && styles.dockActive]}>☰</Text><Text style={[styles.dockLabel, pathname === '/settings' && styles.dockActive]}>เมนู</Text></Pressable>
      </View>}
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

export function Metric({ label, value, hero = false, compact = false }: { label: string; value: string; hero?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.metric, compact && styles.compactMetric, hero && styles.heroMetric]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={[styles.metricValue, hero && styles.heroValue]}>{value}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
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
  fillScroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 128 },
  fillScrollContent: { flexGrow: 1, paddingBottom: 28 },
  screen: { width: '100%', maxWidth: 640, alignSelf: 'center', flexGrow: 1, gap: 20 },
  fillScreen: { flex: 1 },
  dock: { position: 'absolute', bottom: 16, height: 76, width: '94%', maxWidth: 640, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', backgroundColor: '#FFFFFF', borderColor: '#DCE5EC', borderWidth: 1, borderRadius: 26, paddingHorizontal: 8, shadowColor: '#1C2733', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
  dockItem: { flex: 1, minWidth: 0, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 5 },
  dockIcon: { color: '#6B7B8C', fontSize: 23, fontWeight: '700' },
  dockLabel: { color: '#6B7B8C', fontSize: 11, fontWeight: '700' },
  dockActive: { color: '#13AFA6' },
  startDockButton: { width: 64, height: 64, marginTop: -76, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#43C7B5', borderColor: '#FFFFFF', borderWidth: 5, shadowColor: '#159E9A', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  startDockIcon: { color: '#FFFFFF', fontSize: 27, fontWeight: '700', marginLeft: 3 },
  eyebrow: { color: '#38AFA1', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: '#191D23', fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  body: { color: '#667282', fontSize: 16, lineHeight: 24 },
  metric: { flex: 1, minWidth: 0, minHeight: 96, borderRadius: 20, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, padding: 18, gap: 8, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  compactMetric: { minHeight: 70, padding: 10, gap: 5, borderRadius: 14 }, heroMetric: { minHeight: 190, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5F5F1', borderColor: '#D6EEE8' },
  metricLabel: { color: '#697584', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  metricValue: { color: '#191D23', fontSize: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroValue: { fontSize: 48 },
  button: { minHeight: 54, flexGrow: 1, flexShrink: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#43C7B5', paddingHorizontal: 18 },
  compactButton: { alignSelf: 'center', width: '72%', minHeight: 50, flexGrow: 0, paddingHorizontal: 14 },
  secondaryButton: { borderColor: '#DDE4EA', borderWidth: 1, backgroundColor: '#FFFFFF' },
  dangerButton: { backgroundColor: '#E66D6D' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#14202B', fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { color: '#303945' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
