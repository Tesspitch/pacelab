import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function RunScreen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>
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
  safeArea: { flex: 1, backgroundColor: '#050816' },
  screen: { flexGrow: 1, gap: 16, padding: 20, paddingBottom: 40 },
  eyebrow: { color: '#5EEAD4', fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: '#F8FAFC', fontSize: 34, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: '#AAB4C5', fontSize: 16, lineHeight: 24 },
  metric: { flex: 1, minWidth: 140, borderRadius: 18, backgroundColor: '#11182A', padding: 18, gap: 8 },
  heroMetric: { minHeight: 170, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B2130' },
  metricLabel: { color: '#8EA0B8', fontSize: 13, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  metricValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroValue: { fontSize: 60 },
  button: { minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#5EEAD4', paddingHorizontal: 18 },
  secondaryButton: { borderColor: '#334155', borderWidth: 1, backgroundColor: '#11182A' },
  dangerButton: { backgroundColor: '#F87171' },
  buttonMuted: { opacity: 0.55 },
  buttonText: { color: '#041016', fontSize: 16, fontWeight: '900' },
  secondaryButtonText: { color: '#F8FAFC' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
