import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  advanceWorkoutRun,
  createWorkoutRunState,
  createGpsTrackerState,
  finishWorkoutRun,
  getSessionElapsedMs,
  pauseWorkoutRun,
  resumeWorkoutRun,
  startWorkoutRun,
  type WorkoutRunEvent,
  type WorkoutRunState,
  type GpsTrackerState,
  type WorkoutDefinition,
  expandWorkoutTimeline,
} from '@pacelab/domain';

import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { workoutCueQueue } from '@/lib/audio-cues';
import { createLocalSession, finishLocalSession, getSessionGpsTracker, recordSessionEvent, recordSessionStepResult, setSessionPaused } from '@/lib/database';
import { formatDistance, formatMilliseconds } from '@/lib/format';
import {
  getLocationPermissionSnapshot,
  requestForegroundLocationPermission,
  startBackgroundLocationTracking,
  startForegroundLocationTracking,
  stopBackgroundLocationTracking,
  type LocationTrackingSubscription,
} from '@/lib/location-service';
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
  const params = useLocalSearchParams<{ workout?: string }>();
  const workout = (() => { try { return typeof params.workout === 'string' ? JSON.parse(params.workout) as WorkoutDefinition : sampleWorkout; } catch { return sampleWorkout; } })();
  const timeline = workout === sampleWorkout ? sampleTimeline : expandWorkoutTimeline(workout);
  const [run, setRun] = useState(() => createWorkoutRunState(timeline));
  const [clockMs, setClockMs] = useState(() => performance.now());
  const [message, setMessage] = useState('Countdown และ transition cues พร้อมทำงาน');
  const [gps, setGps] = useState<GpsTrackerState>(createGpsTrackerState);
  const [stepStartedDistanceM, setStepStartedDistanceM] = useState(0);
  const sessionId = useRef<string | null>(null);
  const eventSequence = useRef(0);
  const persistedCompletion = useRef(false);
  const gpsRef = useRef(gps);
  const stepStartDistanceM = useRef(0);
  const foregroundSubscription = useRef<LocationTrackingSubscription | null>(null);
  const backgroundRunning = useRef(false);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyGpsState = (next: GpsTrackerState) => {
    gpsRef.current = next;
    setGps(next);
  };

  const stopGps = async () => {
    await foregroundSubscription.current?.stop();
    foregroundSubscription.current = null;
    if (backgroundRunning.current) await stopBackgroundLocationTracking();
    backgroundRunning.current = false;
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = null;
  };

  const startGps = async (id: string) => {
    let permission = await getLocationPermissionSnapshot();
    if (!permission.servicesEnabled) {
      setMessage('GPS ปิดอยู่ · workout แบบจับเวลายังทำงานต่อ');
      return;
    }
    if (permission.foreground !== 'granted') {
      await requestForegroundLocationPermission();
      permission = await getLocationPermissionSnapshot();
    }
    if (permission.foreground !== 'granted') {
      setMessage('ไม่ได้รับสิทธิ์ GPS · workout แบบจับเวลายังทำงานต่อ');
      return;
    }
    if (permission.background === 'granted') {
      await startBackgroundLocationTracking(id);
      backgroundRunning.current = true;
      pollingTimer.current = setInterval(() => {
        void getSessionGpsTracker(id).then(applyGpsState);
      }, 500);
      return;
    }
    foregroundSubscription.current = await startForegroundLocationTracking(
      id,
      (result) => applyGpsState(result.state),
      (error) => setMessage(`GPS ขัดข้อง: ${error} · workout ยังทำงานต่อ`),
    );
  };

  useEffect(() => () => { void stopGps(); }, []);

  const enrichAndPersistStepEvents = (events: readonly WorkoutRunEvent[]): readonly WorkoutRunEvent[] => {
    const currentDistanceM = gpsRef.current.cumulativeDistanceM;
    const enriched = events.map((event): WorkoutRunEvent => {
      if (event.type !== 'STEP_COMPLETED') return event;
      const actualDistanceM = Math.max(0, currentDistanceM - stepStartDistanceM.current);
      if (sessionId.current) {
        void recordSessionStepResult({
          sessionId: sessionId.current,
          stepExecutionId: event.step.executionId,
          stepOrder: event.step.sequence,
          stepKind: event.step.kind,
          setNumber: event.step.repetition,
          elapsedMs: event.actualElapsedMs,
          distanceM: gpsRef.current.lastAcceptedPoint ? actualDistanceM : null,
          completionStatus: 'completed',
        });
      }
      return { ...event, actualDistanceM: gpsRef.current.lastAcceptedPoint ? actualDistanceM : null };
    });
    if (events.some((event) => event.type === 'STEP_STARTED')) {
      stepStartDistanceM.current = currentDistanceM;
      setStepStartedDistanceM(currentDistanceM);
    }
    return enriched;
  };

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
    void stopGps().then(() => finishLocalSession({
      sessionId: sessionId.current!,
      elapsedMs: state.finalElapsedMs ?? 0,
      distanceM: gpsRef.current.cumulativeDistanceM,
    }))
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
        const events = enrichAndPersistStepEvents(transition.events);
        workoutCueQueue.enqueue(events);
        if (events.length > 0) {
          recordAction('domain_transition', getSessionElapsedMs(transition.state, now), events);
        }
        persistCompletion(transition.state);
        return transition.state;
      });
    }, 200);
    return () => clearInterval(timer);
    // The interval is intentionally recreated only when the run status changes.
    // Domain callbacks use refs/current render state and must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  useEffect(() => () => workoutCueQueue.cancelPending(), []);

  const start = async () => {
    try {
      sessionId.current = await createLocalSession({ mode: 'speedwork', workoutSnapshot: workout });
      workoutCueQueue.reset();
      const now = performance.now();
      const transition = startWorkoutRun(run, now);
      setClockMs(now);
      setRun(transition.state);
      workoutCueQueue.enqueue(transition.events);
      recordAction('start', 0, transition.events);
      await startGps(sessionId.current);
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
    void stopGps();
  };

  const resume = () => {
    const now = performance.now();
    const transition = resumeWorkoutRun(run, now);
    setRun(transition.state);
    setClockMs(now);
    workoutCueQueue.enqueue(transition.events);
    recordAction('resume', getSessionElapsedMs(transition.state, now), transition.events);
    if (sessionId.current) void setSessionPaused(sessionId.current, false);
    if (sessionId.current) void startGps(sessionId.current);
  };

  const finish = () => {
    const now = performance.now();
    const activeStep = run.timeline[run.stepIndex];
    if (sessionId.current && activeStep && run.stepStartedAtMs !== null) {
      const effectiveNow = run.status === 'PAUSED' && run.pausedAtMs !== null ? run.pausedAtMs : now;
      void recordSessionStepResult({
        sessionId: sessionId.current,
        stepExecutionId: activeStep.executionId,
        stepOrder: activeStep.sequence,
        stepKind: activeStep.kind,
        setNumber: activeStep.repetition,
        elapsedMs: Math.max(0, effectiveNow - run.stepStartedAtMs),
        distanceM: gpsRef.current.lastAcceptedPoint
          ? Math.max(0, gpsRef.current.cumulativeDistanceM - stepStartDistanceM.current)
          : null,
        completionStatus: 'partial',
      });
    }
    const transition = finishWorkoutRun(run, now);
    workoutCueQueue.cancelPending();
    setRun(transition.state);
    setClockMs(now);
    recordAction('finish_early', transition.state.finalElapsedMs ?? 0, transition.events);
    persistCompletion(transition.state);
  };

  const confirmFinish = () => Alert.alert('จบ Workout?', 'ระบบจะบันทึกผลของช่วงที่ทำไปแล้ว', [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'จบและบันทึก', style: 'destructive', onPress: finish },
  ]);

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
        <Metric label="Set distance" value={gps.lastAcceptedPoint ? formatDistance(Math.max(0, gps.cumulativeDistanceM - stepStartedDistanceM)) : '— km'} />
        <Metric label="Session elapsed" value={formatMilliseconds(elapsedMs)} />
      </View>
      <BodyText>{message}</BodyText>
      {run.status === 'READY' && <ActionButton label="เริ่มวิ่ง" onPress={() => void start()} />}
      {(run.status === 'PRESTART' || run.status.startsWith('ACTIVE_')) && <ButtonRow><ActionButton label="พัก" tone="secondary" onPress={pause} /><ActionButton label="จบก่อนกำหนด" tone="danger" onPress={confirmFinish} /></ButtonRow>}
      {run.status === 'PAUSED' && <ButtonRow><ActionButton label="ทำต่อ" onPress={resume} /><ActionButton label="จบก่อนกำหนด" tone="danger" onPress={confirmFinish} /></ButtonRow>}
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
  completeCard: { gap: 12, borderRadius: 18, backgroundColor: '#DFF0FF', padding: 18 },
  completeTitle: { color: '#145DA0', fontSize: 22, fontWeight: '700' },
  completeText: { color: '#486581', fontSize: 16 },
});
