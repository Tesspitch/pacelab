import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { formatMilliseconds, formatStepGoal } from '@/lib/format';
import { saveCustomWorkout } from '@/lib/database';
import { expandWorkoutTimeline } from '@pacelab/domain';
import { samplePlannedDurationMs, sampleTimeline, sampleWorkout } from '@/lib/sample-workout';
import type { WorkoutDefinition } from '@pacelab/domain';

const kindLabel = { WARMUP: 'วอร์มอัพ', WORK: 'วิ่ง', RECOVERY: 'พัก', COOLDOWN: 'คูลดาวน์' } as const;

export default function WorkoutPreviewScreen() {
  const params = useLocalSearchParams<{ workout?: string; draft?: string }>();
  const isDraft = params.draft === '1';
  let workout = sampleWorkout;
  if (typeof params.workout === 'string') {
    try { workout = JSON.parse(params.workout) as WorkoutDefinition; } catch { /* use default */ }
  }
  const timeline = workout === sampleWorkout ? sampleTimeline : expandWorkoutTimeline(workout);
  const workCount = timeline.filter((step) => step.kind === 'WORK').length;
  const recoveryCount = timeline.filter((step) => step.kind === 'RECOVERY').length;
  const plannedDuration = workout === sampleWorkout ? samplePlannedDurationMs : timeline.every((step) => step.goal.type === 'TIME') ? timeline.reduce((sum, step) => sum + (step.goal.type === 'TIME' ? step.goal.durationMs : 0), 0) : null;
  return (
    <RunScreen>
      <Eyebrow>ตรวจแผนก่อนเริ่ม</Eyebrow>
      <ScreenTitle>{workout.name}</ScreenTitle>
      <BodyText>ตรวจรายละเอียดก่อนเริ่ม · countdown จะเริ่มให้อัตโนมัติ</BodyText>
      <View style={styles.metrics}>
        <Metric label="เวลารวม" value={plannedDuration === null ? 'ตามระยะทาง' : formatMilliseconds(plannedDuration)} />
        <Metric label="Work / Recovery" value={`${workCount} / ${recoveryCount}`} />
      </View>
      <View style={styles.timeline}>
        <Text style={styles.chartTitle}>โครงสร้างการวิ่ง</Text>
        <View style={styles.horizontalChart}>
          {timeline.map((step) => <View key={`bar-${step.executionId}`} style={[styles.horizontalBar, step.kind === 'WORK' ? styles.workBar : step.kind === 'RECOVERY' ? styles.recoveryBar : styles.otherBar, step.kind === 'WORK' ? styles.workHeight : step.kind === 'RECOVERY' ? styles.recoveryHeight : styles.otherHeight, { flex: Math.max(1, step.goal.type === 'TIME' ? step.goal.durationMs : step.goal.distanceM) }]}><Text style={styles.horizontalBarText}>{step.kind === 'WORK' ? 'W' : step.kind === 'RECOVERY' ? 'R' : step.kind === 'WARMUP' ? 'WU' : 'CD'}</Text></View>)}
        </View>
        <Text style={styles.chartLegend}>ซ้าย → ขวา: ลำดับการวิ่ง · ความกว้าง = เวลา/ระยะทาง · ความสูง = ประเภทช่วง</Text>
        <View style={styles.detailList}>
          {timeline.map((step, index) => (
            <View key={`detail-${step.executionId}`} style={styles.detailRow}>
              <View style={[styles.detailMarker, step.kind === 'WORK' ? styles.workMarker : step.kind === 'RECOVERY' ? styles.recoveryMarker : styles.otherMarker]} />
              <Text style={styles.detailIndex}>{step.kind === 'WORK' ? `Lap ${step.repetition ?? index + 1}` : `${index + 1}`}</Text>
              <Text style={styles.detailKind}>{kindLabel[step.kind]}</Text>
              <Text style={styles.detailGoal}>{formatStepGoal(step)}</Text>
            </View>
          ))}
        </View>
      </View>
      {isDraft ? <ButtonRow>
        <ActionButton label="บันทึก preset" tone="secondary" onPress={() => void saveCustomWorkout(workout).then(() => router.replace('/run-start'))} />
        <ActionButton label="เริ่มวิ่งเลย" onPress={() => router.push({ pathname: '/interval-run', params: { workout: JSON.stringify(workout) } })} />
      </ButtonRow> : <ActionButton label="เริ่มวิ่ง" onPress={() => router.push({ pathname: '/interval-run', params: { workout: JSON.stringify(workout) } })} />}
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  timeline: { gap: 10, borderRadius: 0, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, padding: 18, overflow: 'hidden', shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  chartTitle: { color: '#191D23', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  horizontalChart: { flexDirection: 'row', height: 58, overflow: 'hidden', gap: 2, alignItems: 'flex-end' },
  horizontalBar: { minWidth: 7, alignItems: 'center', justifyContent: 'center' },
  workHeight: { height: 58 },
  recoveryHeight: { height: 30 },
  otherHeight: { height: 42 },
  horizontalBarText: { color: '#191D23', fontSize: 10, fontWeight: '900' },
  chartLegend: { color: '#788493', fontSize: 11, lineHeight: 16 },
  detailList: { gap: 6, marginTop: 6 },
  detailRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomColor: '#E8EDF1', borderBottomWidth: 1 },
  detailMarker: { width: 8, height: 8, borderRadius: 4 },
  workMarker: { backgroundColor: '#EF8B7B' },
  recoveryMarker: { backgroundColor: '#43C7B5' },
  otherMarker: { backgroundColor: '#99A5B1' },
  detailIndex: { width: 52, color: '#788493', fontSize: 12, fontWeight: '800' },
  detailKind: { flex: 1, color: '#303945', fontSize: 14, fontWeight: '800' },
  detailGoal: { color: '#299F92', fontSize: 13, fontWeight: '900' },
  workBar: { backgroundColor: '#EF8B7B' },
  recoveryBar: { backgroundColor: '#43C7B5' },
  otherBar: { backgroundColor: '#CBD3DB' },
});
