import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BodyText, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { formatStepGoal, formatMilliseconds } from '@/lib/format';
import { samplePlannedDurationMs, sampleTimeline, sampleWorkout } from '@/lib/sample-workout';

const kindLabel = { WARMUP: 'Warm-up', WORK: 'Work', RECOVERY: 'Recovery', COOLDOWN: 'Cool-down' } as const;

export default function WorkoutPreviewScreen() {
  const workCount = sampleTimeline.filter((step) => step.kind === 'WORK').length;
  const recoveryCount = sampleTimeline.filter((step) => step.kind === 'RECOVERY').length;
  return (
    <RunScreen>
      <Eyebrow>ตรวจแผนก่อนเริ่ม</Eyebrow>
      <ScreenTitle>{sampleWorkout.name}</ScreenTitle>
      <BodyText>Countdown ก่อนเริ่ม 5 วินาทีไม่รวมในเวลาออกกำลัง ส่วน countdown ก่อนจบ Work และก่อน Work ถัดไปอยู่ภายในเวลาเดิม</BodyText>
      <View style={styles.metrics}>
        <Metric label="Planned time" value={formatMilliseconds(samplePlannedDurationMs)} />
        <Metric label="Work / Recovery" value={`${workCount} / ${recoveryCount}`} />
      </View>
      <View style={styles.timeline}>
        {sampleTimeline.map((step) => (
          <View key={step.executionId} style={styles.step}>
            <View style={[styles.dot, step.kind === 'WORK' && styles.workDot]} />
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{kindLabel[step.kind]}{step.kind === 'WORK' ? ` ${step.repetition ?? ''}` : ''}</Text>
              <Text style={styles.stepMeta}>{formatStepGoal(step)}</Text>
            </View>
          </View>
        ))}
      </View>
      <ActionButton label="เริ่ม Speedwork" onPress={() => router.push('/interval-run')} />
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  timeline: { gap: 2, borderRadius: 20, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#11182A', padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#64748B' },
  workDot: { backgroundColor: '#5EEAD4' },
  stepText: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  stepTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  stepMeta: { color: '#9AA9BD', fontSize: 15, fontVariant: ['tabular-nums'] },
});
