import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';
import {
  createFreeRunState,
  createGpsTrackerState,
  finishFreeRun,
  getFreeRunElapsedMs,
  getGpsSignalLabel,
  observeFreeRun,
  pauseFreeRun,
  resumeFreeRun,
  startFreeRun,
  restoreFreeRun,
  type GpsTrackerState,
} from '@pacelab/domain';

import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { speakFreeRunLap } from '@/lib/audio-cues';
import { createLocalSession, finishLocalSession, getInProgressSession, getSessionGpsTracker, recordSessionEvent, setSessionPaused, updateSessionElapsed } from '@/lib/database';
import { formatDistance, formatMilliseconds, formatPaceSecondsPerKm } from '@/lib/format';
import {
  getLocationPermissionSnapshot,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
  startBackgroundLocationTracking,
  startForegroundLocationTracking,
  stopBackgroundLocationTracking,
  type LocationTrackingSubscription,
} from '@/lib/location-service';

export default function FreeRunScreen() {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const [run, setRun] = useState(createFreeRunState);
  const [clockMs, setClockMs] = useState(() => performance.now());
  const [message, setMessage] = useState('พร้อมเริ่ม · หาก GPS ไม่พร้อม ตัวจับเวลายังคงทำงานต่อ');
  const [gps, setGps] = useState<GpsTrackerState>(createGpsTrackerState);
  const [gpsPulse, setGpsPulse] = useState(true);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const sessionId = useRef<string | null>(null);
  const eventSequence = useRef(0);
  const foregroundSubscription = useRef<LocationTrackingSubscription | null>(null);
  const backgroundRunning = useRef(false);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopGps = async () => {
    await foregroundSubscription.current?.stop();
    foregroundSubscription.current = null;
    if (backgroundRunning.current) await stopBackgroundLocationTracking();
    backgroundRunning.current = false;
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = null;
  };

  useEffect(() => () => { void stopGps(); }, []);

  useEffect(() => {
    if (run.status !== 'ACTIVE') return;
    const timer = setInterval(() => {
      const now = performance.now();
      setClockMs(now);
      setRun((current) => observeFreeRun(current, now));
    }, 250);
    return () => clearInterval(timer);
  }, [run.status]);

  useEffect(() => {
    if (getGpsSignalLabel(gps) !== 'WAITING') return;
    const timer = setInterval(() => setGpsPulse((current) => !current), 700);
    return () => clearInterval(timer);
  }, [gps]);

  // Recovery runs once for the route's persisted session; startGps is stable for this screen.
  useEffect(() => {
    if (!sessionId.current || run.status === 'READY' || run.status === 'COMPLETED') return;
    const timer = setInterval(() => {
      if (sessionId.current) void updateSessionElapsed(sessionId.current, getFreeRunElapsedMs(run, performance.now()));
    }, 2000);
    return () => clearInterval(timer);
  }, [run]);

  useEffect(() => () => {
    if (sessionId.current && (run.status === 'ACTIVE' || run.status === 'PAUSED')) {
      void updateSessionElapsed(sessionId.current, getFreeRunElapsedMs(run, performance.now()));
    }
    // Cleanup intentionally uses the latest run snapshot when the status changes or screen unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status]);

  const recordEvent = (type: string, elapsedMs: number) => {
    if (!sessionId.current) return;
    eventSequence.current += 1;
    void recordSessionEvent({ sessionId: sessionId.current, sequence: eventSequence.current, type, elapsedMs });
  };

  const applyGpsState = (next: GpsTrackerState) => {
    setGps((current) => {
      const previousLapCount = current.completedLaps.length;
      const lap = next.completedLaps.at(-1);
      if (lap && next.completedLaps.length > previousLapCount) {
        speakFreeRunLap(lap, getFreeRunElapsedMs(run, performance.now()));
        setMessage(`กม. ${lap.lapIndex} · pace ${formatPaceSecondsPerKm(lap.averagePaceSecondsPerKm)}`);
      }
      return next;
    });
  };

  const startGps = async (id: string) => {
    let permission = await getLocationPermissionSnapshot();
    if (!permission.servicesEnabled) {
      setMessage('Location Services ปิดอยู่ · จับเวลาต่อได้แต่ระยะทางไม่พร้อม');
      return;
    }
    if (permission.foreground !== 'granted') {
      await requestForegroundLocationPermission();
      permission = await getLocationPermissionSnapshot();
    }
    if (permission.foreground !== 'granted') {
      setMessage('ไม่ได้รับสิทธิ์ตำแหน่ง · ทำงานแบบ timer-only');
      return;
    }
    if (permission.background !== 'granted') {
      await requestBackgroundLocationPermission();
      permission = await getLocationPermissionSnapshot();
    }
    if (permission.background === 'granted') {
      await startBackgroundLocationTracking(id);
      backgroundRunning.current = true;
      pollingTimer.current = setInterval(() => {
        void getSessionGpsTracker(id).then(applyGpsState);
      }, 1000);
      setMessage('GPS ทำงานแบบ foreground service และบันทึกลงเครื่อง');
      return;
    }
    foregroundSubscription.current = await startForegroundLocationTracking(
      id,
      (result) => applyGpsState(result.state),
      (error) => setMessage(`GPS ขัดข้อง: ${error} · ตัวจับเวลายังทำงาน`),
    );
    setMessage('GPS ทำงานขณะเปิดแอป · ตำแหน่งเบื้องหลังยังไม่พร้อม');
  };

  useEffect(() => {
    const savedId = typeof params.sessionId === 'string' ? params.sessionId : null;
    if (!savedId || sessionId.current) return;
    void getInProgressSession(savedId).then(async (saved) => {
      if (!saved) return;
      const now = performance.now();
      sessionId.current = saved.id;
      setClockMs(now);
      const wallClockElapsed = Math.max(0, Date.now() - Date.parse(saved.startedAt));
      const restoredElapsed = saved.status === 'in_progress'
        ? Math.max(saved.elapsedMs, wallClockElapsed)
        : saved.elapsedMs;
      setRun(restoreFreeRun(saved.status === 'paused' ? 'PAUSED' : 'ACTIVE', restoredElapsed, now));
      setGps(await getSessionGpsTracker(saved.id));
      if (saved.status === 'in_progress') await startGps(saved.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sessionId]);

  const start = async () => {
    try {
      sessionId.current = await createLocalSession({ mode: 'free_run', runType: 'general' });
      const now = performance.now();
      setClockMs(now);
      setRun((current) => startFreeRun(current, now));
      recordEvent('start', 0);
      await startGps(sessionId.current);
    } catch (error) {
      setMessage(`เริ่มไม่ได้: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const pause = () => {
    const now = performance.now();
    const elapsed = getFreeRunElapsedMs(run, now);
    setRun((current) => pauseFreeRun(current, now));
    setClockMs(now);
    recordEvent('pause', elapsed);
    if (sessionId.current) void updateSessionElapsed(sessionId.current, elapsed).then(() => setSessionPaused(sessionId.current!, true));
    void stopGps();
  };

  const resume = () => {
    const now = performance.now();
    setRun((current) => resumeFreeRun(current, now));
    setClockMs(now);
    recordEvent('resume', getFreeRunElapsedMs(run, now));
    if (sessionId.current) void setSessionPaused(sessionId.current, false);
    if (sessionId.current) void startGps(sessionId.current);
  };

  const finish = async () => {
    if (!sessionId.current) {
      setMessage('ยังไม่มี session สำหรับบันทึกกิจกรรม');
      return;
    }
    try {
      const id = sessionId.current;
      const now = performance.now();
      const finished = finishFreeRun(run, now);
      await stopGps();
      const finalGps = await getSessionGpsTracker(id);
      setGps(finalGps);
      setRun(finished);
      setClockMs(now);
      recordEvent('finish', finished.finalElapsedMs ?? 0);
      await finishLocalSession({ sessionId: id, elapsedMs: finished.finalElapsedMs ?? 0, distanceM: finalGps.cumulativeDistanceM });
      // Reset the live screen before leaving it so a later run always starts clean.
      setRun(createFreeRunState());
      setGps(createGpsTrackerState());
      setClockMs(performance.now());
      setMessage('บันทึกกิจกรรมลง SQLite สำเร็จ');
      sessionId.current = null;
      eventSequence.current = 0;
      router.replace({ pathname: '/activity/[id]', params: { id } });
    } catch (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const confirmFinish = () => setShowFinishConfirm(true);

  const elapsedMs = getFreeRunElapsedMs(run, clockMs);
  return (
    <RunScreen>
      <Eyebrow>Run · {run.status}</Eyebrow>
      <ScreenTitle>วิ่งอิสระ</ScreenTitle>
      <Metric label="Distance" value={gps.lastAcceptedPoint ? formatDistance(gps.cumulativeDistanceM) : '0.00 km'} hero />
      <View style={styles.metrics}>
        <Metric label="Duration" value={formatMilliseconds(elapsedMs)} />
        <Metric label="Current pace" value={formatPaceSecondsPerKm(gps.currentPaceSecondsPerKm)} />
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusChip, getGpsSignalLabel(gps) === 'WAITING' ? styles.waitingChip : getGpsSignalLabel(gps) === 'GOOD' ? styles.goodChip : styles.degradedChip, !gpsPulse && styles.pulseOff]}><Text style={styles.statusIcon}>◉</Text><Text style={styles.statusChipText}>GPS {getGpsSignalLabel(gps)}</Text></View>
      </View>
      <BodyText>{message}</BodyText>
      {run.status === 'READY' && <ActionButton label="เริ่มวิ่ง" onPress={() => void start()} />}
      {run.status === 'ACTIVE' && <ButtonRow><ActionButton label="พัก" tone="secondary" onPress={pause} /><ActionButton label="จบและบันทึก" tone="danger" onPress={confirmFinish} /></ButtonRow>}
      {run.status === 'PAUSED' && <ButtonRow><ActionButton label="วิ่งต่อ" onPress={resume} /><ActionButton label="จบและบันทึก" tone="danger" onPress={confirmFinish} /></ButtonRow>}
      <Modal
        visible={showFinishConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFinishConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>จบกิจกรรม?</Text>
            <Text style={styles.confirmText}>ระบบจะบันทึกเวลา ระยะทาง และข้อมูล GPS ของกิจกรรมนี้</Text>
            <ButtonRow>
              <ActionButton label="ยกเลิก" tone="secondary" onPress={() => setShowFinishConfirm(false)} />
              <ActionButton label="จบและบันทึก" tone="danger" onPress={() => { setShowFinishConfirm(false); void finish(); }} />
            </ButtonRow>
          </View>
        </View>
      </Modal>
      {run.status === 'COMPLETED' && (
        <View style={styles.completeCard}>
          <Text style={styles.completeTitle}>กิจกรรมเสร็จสมบูรณ์</Text>
          <ActionButton label="กลับหน้าหลัก" onPress={() => router.replace('/')} />
        </View>
      )}
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  statusChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  waitingChip: { backgroundColor: '#FFF7D6', borderColor: '#F3C969' },
  goodChip: { backgroundColor: '#E3F8EF', borderColor: '#8AD4AE' },
  degradedChip: { backgroundColor: '#FFF0E0', borderColor: '#F0A35B' },
  pulseOff: { opacity: 0.42 },
  statusIcon: { color: '#145DA0', fontSize: 14, fontWeight: '900' },
  statusChipText: { color: '#145DA0', fontSize: 13, fontWeight: '800' },
  completeCard: { gap: 14, borderRadius: 18, backgroundColor: '#DFF0FF', padding: 18 },
  completeTitle: { color: '#145DA0', fontSize: 20, fontWeight: '900' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 24, 38, 0.62)', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 430, gap: 10, borderLeftWidth: 4, borderLeftColor: '#E66D6D', backgroundColor: '#FFF3F1', padding: 18, borderRadius: 0 },
  confirmTitle: { color: '#8C2F39', fontSize: 20, fontWeight: '900' },
  confirmText: { color: '#5F4A4D', fontSize: 14, lineHeight: 20 },
});
