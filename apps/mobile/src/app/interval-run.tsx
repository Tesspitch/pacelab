import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  advanceWorkoutRun,
  createWorkoutRunState,
  finishWorkoutRun,
  getSessionElapsedMs,
  pauseWorkoutRun,
  resumeWorkoutRun,
  startWorkoutRun,
  type WorkoutRunEvent,
  type WorkoutRunState,
} from '@pacelab/domain';

import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { workoutCueQueue } from '@/lib/audio-cues';
import { createLocalSession, finishLocalSession, recordSessionEvent, setSessionPaused } from '@/lib/database';
import { formatMilliseconds } from '@/lib/format';
import { sampleTimeline, sampleWorkout } from '@/lib/sample-workout';

function remainingMs(state: WorkoutRunState, nowMs: number): number {
  const effectiveNow = state.status === 'PAUSED' && state.pausedAtMs !== null ? state.pausedAtMs : nowMs;
  if (state.status === 'PRESTART' && state.prestartStartedAtMs !== null) {
    return Math.max(0, state.countdown.durationSeconds * 1000 - (effectiveNow - state.prestartStartedAtMs));
  }
  const step = state.timeline[state.stepIndex];
  if (!step || step.goal.type !== 'TIME' || state.stepStartedAtMs === null) return 0;
  return Math.max(0, step.goal.durationMs - (effectiveNow - state.stepStartedAtMs));
}

export default function IntervalRunScreen() {
  const [run, setRun] = useState(() => createWorkoutRunState(sampleTimeline));
  const [clockMs, setClockMs] = useState(() => performance.now());
  const [message, setMessage] = useState('Countdown และ transition cues พร้อมทำงาน');
  const sessionId = useRef<string | null>(null);
  const eventSequence = useRef(0);
  const persistedCompletion = useRef(false);

  const recordAction = (type: string, elapsedMs: number, events: readonly WorkoutRunEvent[] = []) => {
    if (!sessionId.current) return;
    eventSequence.current += 1;
    void recordSessionEvent({
      sessionId: sessionId.current,
      sequence: eventSequence.current,
      type,
      elapsedMs,
      payload: { domainEvents: events.map((event) => event.type) },
    });
  };

  const persistCompletion = (state: WorkoutRunState) => {
    if (!sessionId.current || persistedCompletion.current || state.status !== 'COMPLETED') return;
    persistedCompletion.current = true;
    void finishLocalSession({ sessionId: sessionId.current, elapsedMs: state.finalElapsedMs ?? 0 })
      .then(() => setMessage('Workout เสร็จและบันทึกลง SQLite แล้ว'))
      .catch((error: unknown) => setMessage(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`));
  };

  useEffect(() => {
    const progressing = run.status === 'PRESTART' || run.status.startsWith('ACTIVE_');
    if (!progressing) return;
    const timer = setInterval(() => {
      const now = performance.now();
      setClockMs(now);
      setRun((current) => {
        const transition = advanceWorkoutRun(current, now);
        workoutCueQueue.enqueue(transition.events);
        if (transition.events.length > 0) {
          recordAction('domain_transition', getSessionElapsedMs(transition.state, now), transition.events);
        }
        persistCompletion(transition.state);
        return transition.state;
      });
    }, 200);
    return () => clearInterval(timer);
  }, [run.status]);

  useEffect(() => () => workoutCueQueue.cancelPending(), []);

  const start = async () => {
    try {
      sessionId.current = await createLocalSession({ mode: 'speedwork', workoutSnapshot: sampleWorkout });
      workoutCueQueue.reset();
      const now = performance.now();
      const transition = startWorkoutRun(run, now);
      setClockMs(now);
      setRun(transition.state);
      workoutCueQueue.enqueue(transition.events);
      recordAction('start', 0, transition.events);
    } catch (error) {
      setMessage(`เริ่มไม่ได้: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const pause = () => {
    const now = performance.now();
    const transition = pauseWorkoutRun(run, now);
    workoutCueQueue.cancelPending();
    setRun(transition.state);
    setClockMs(now);
    recordAction('pause', getSessionElapsedMs(transition.state, now), transition.events);
    if (sessionId.current) void setSessionPaused(sessionId.current, true);
  };

  const resume = () => {
    const now = performance.now();
    const transition = resumeWorkoutRun(run, now);
    setRun(transition.state);
    setClockMs(now);
    workoutCueQueue.enqueue(transition.events);
    recordAction('resume', getSessionElapsedMs(transition.state, now), transition.events);
    if (sessionId.current) void setSessionPaused(sessionId.current, false);
  };

  const finish = () => {
    const now = performance.now();
    const transition = finishWorkoutRun(run, now);
    workoutCueQueue.cancelPending();
    setRun(transition.state);
    setClockMs(now);
    recordAction('finish_early', transition.state.finalElapsedMs ?? 0, transition.events);
    persistCompletion(transition.state);
  };

  const currentStep = run.timeline[run.stepIndex];
  const stateLabel = run.status === 'PRESTART' ? 'GET READY' : currentStep?.kind ?? run.status;
  const setLabel = currentStep?.kind === 'WORK' ? `SET ${currentStep.repetition ?? 1} / 6` : '—';
  const elapsedMs = getSessionElapsedMs(run, clockMs);

  return (
    <RunScreen>
      <Eyebrow>{stateLabel} · {setLabel}</Eyebrow>
      <ScreenTitle>{run.status === 'PAUSED' ? 'หยุดพัก' : 'Speedwork'}</ScreenTitle>
      <Metric label={run.status === 'PRESTART' ? 'Start in' : 'Set remaining'} value={formatMilliseconds(remainingMs(run, clockMs))} hero />
      <View style={styles.metrics}>
        <Metric label="Set distance" value="— km" />
        <Metric label="Session elapsed" value={formatMilliseconds(elapsedMs)} />
      </View>
      <BodyText>{message}</BodyText>
      {run.status === 'READY' && <ActionButton label="เริ่ม Countdown 5 วินาที" onPress={() => void start()} />}
      {(run.status === 'PRESTART' || run.status.startsWith('ACTIVE_')) && <ButtonRow><ActionButton label="พัก" tone="secondary" onPress={pause} /><ActionButton label="จบก่อนกำหนด" tone="danger" onPress={finish} /></ButtonRow>}
      {run.status === 'PAUSED' && <ButtonRow><ActionButton label="ทำต่อ" onPress={resume} /><ActionButton label="จบก่อนกำหนด" tone="danger" onPress={finish} /></ButtonRow>}
      {run.status === 'COMPLETED' && (
        <View style={styles.completeCard}>
          <Text style={styles.completeTitle}>Workout complete</Text>
          <Text style={styles.completeText}>เวลาที่บันทึก {formatMilliseconds(run.finalElapsedMs ?? 0)}</Text>
          <ActionButton label="กลับหน้าหลัก" onPress={() => router.replace('/')} />
        </View>
      )}
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  completeCard: { gap: 12, borderRadius: 18, backgroundColor: '#123127', padding: 18 },
  completeTitle: { color: '#A7F3D0', fontSize: 22, fontWeight: '900' },
  completeText: { color: '#D1FAE5', fontSize: 16 },
});
