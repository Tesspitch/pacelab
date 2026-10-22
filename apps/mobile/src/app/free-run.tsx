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

import { ActionButton, BodyText, ButtonRow, Metric, RunScreen } from '@/components/run-ui';
import { speakFreeRunLap } from '@/lib/audio-cues';
import { createLocalSession, finishLocalSession, getInProgressSession, getSessionGpsPoints, getSessionGpsTracker, recordSessionEvent, setSessionPaused, updateSessionElapsed, type ActivityGpsPoint } from '@/lib/database';
import { formatDistance, formatMilliseconds, formatPaceSecondsPerKm } from '@/lib/format';
import { LiveRouteMap } from '@/components/live-route-map';
import { syncAuthenticatedData } from '@/lib/sync-service';
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
  const [routePoints, setRoutePoints] = useState<ActivityGpsPoint[]>([]);
  const [mapZoom, setMapZoom] = useState(1.18);
  const [gpsConnected, setGpsConnected] = useState(false);
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

  useEffect(() => {
    void getLocationPermissionSnapshot().then((permission) => {
      setGpsConnected(permission.servicesEnabled && permission.foreground === 'granted');
    }).catch(() => setGpsConnected(false));
  }, []);

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
      setGpsConnected(false);
      setMessage('Location Services ปิดอยู่ · จับเวลาต่อได้แต่ระยะทางไม่พร้อม');
      return;
    }
    if (permission.foreground !== 'granted') {
      await requestForegroundLocationPermission();
      permission = await getLocationPermissionSnapshot();
    }
    if (permission.foreground !== 'granted') {
      setGpsConnected(false);
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
        void Promise.all([getSessionGpsTracker(id), getSessionGpsPoints(id)]).then(([state, points]) => { applyGpsState(state); setRoutePoints(points); });
      }, 500);
      setMessage('GPS ทำงานแบบ foreground service และบันทึกลงเครื่อง');
      setGpsConnected(true);
      return;
    }
    foregroundSubscription.current = await startForegroundLocationTracking(
      id,
      (result) => { applyGpsState(result.state); void getSessionGpsPoints(id).then(setRoutePoints); },
      (error) => setMessage(`GPS ขัดข้อง: ${error} · ตัวจับเวลายังทำงาน`),
    );
    setMessage('GPS ทำงานขณะเปิดแอป · ตำแหน่งเบื้องหลังยังไม่พร้อม');
    setGpsConnected(true);
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
      setRoutePoints(await getSessionGpsPoints(saved.id));
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
      void syncAuthenticatedData();
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
  const isReady = run.status === 'READY';
  return (
    <RunScreen hideDock fillScreen>
      <View style={styles.runHeader}>
        <Text style={styles.currentLabel}>CURRENT</Text>
        <Text style={styles.freeRunHeading}>FREE RUN</Text>
      </View>
      <View style={styles.topMetrics}>
        <Metric compact label="Distance" value={gps.lastAcceptedPoint ? formatDistance(gps.cumulativeDistanceM) : '0.00 km'} />
        <Metric compact label="Time" value={formatMilliseconds(elapsedMs)} />
        <Metric compact label="Pace ปัจจุบัน" value={formatPaceSecondsPerKm(gps.currentPaceSecondsPerKm)} />
      </View>
      <View style={styles.mapShell}>
        <LiveRouteMap points={routePoints} zoom={mapZoom} />
        <View style={styles.mapMarker}><Text style={styles.mapMarkerText}>●</Text></View>
        <View style={styles.mapControls}><Text accessibilityRole="button" onPress={() => setMapZoom((value) => Math.min(1.35, Number((value + 0.1).toFixed(2))))} style={styles.mapControl}>＋</Text><Text accessibilityRole="button" onPress={() => setMapZoom((value) => Math.max(0.85, Number((value - 0.1).toFixed(2))))} style={styles.mapControl}>−</Text><Text accessibilityRole="button" onPress={() => setMapZoom(1.18)} style={styles.mapControl}>◉</Text></View>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusChip, gpsConnected ? styles.goodChip : styles.waitingChip, !gpsPulse && !gpsConnected && styles.pulseOff]}><Text style={styles.statusIcon}>◉</Text><Text style={styles.statusChipText}>{gpsConnected ? 'GPS Connect' : 'GPS Waiting'}</Text></View>
      </View>
      {!isReady && !gpsConnected && <BodyText>{message}</BodyText>}
      {isReady && <ActionButton compact label="เริ่มวิ่ง" onPress={() => void start()} />}
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
  runHeader: { alignItems: 'center', gap: 4, paddingTop: 0 },
  currentLabel: { color: '#5C6878', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  freeRunHeading: { color: '#168B80', fontSize: 30, fontWeight: '700', letterSpacing: 1 },
  topMetrics: { flexDirection: 'row', gap: 8, zIndex: 5 },
  mapShell: { flex: 1, minHeight: 300, borderRadius: 24, position: 'relative', overflow: 'hidden', backgroundColor: '#DCEBE8' },
  mapTarget: { position: 'absolute', top: 18, left: 18, right: 18, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.94)' },
  mapTargetText: { color: '#1D242C', fontSize: 17, fontWeight: '700' },
  mapMarker: { position: 'absolute', top: '48%', left: '50%', marginLeft: -20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B82F6', borderColor: '#FFFFFF', borderWidth: 5 },
  mapMarkerText: { color: '#FFFFFF', fontSize: 14 },
  mapControls: { position: 'absolute', right: 16, bottom: 18, gap: 10, alignItems: 'center' },
  mapControl: { borderRadius: 16, width: 48, height: 48, textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#263547', color: '#FFFFFF', fontSize: 26, fontWeight: '400' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  statusChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  waitingChip: { backgroundColor: '#FFF7D6', borderColor: '#F3C969' },
  goodChip: { backgroundColor: '#E3F8EF', borderColor: '#8AD4AE' },
  degradedChip: { backgroundColor: '#FFF0E0', borderColor: '#F0A35B' },
  pulseOff: { opacity: 0.42 },
  statusIcon: { color: '#145DA0', fontSize: 14, fontWeight: '700' },
  statusChipText: { color: '#145DA0', fontSize: 13, fontWeight: '800' },
  completeCard: { gap: 14, borderRadius: 18, backgroundColor: '#DFF0FF', padding: 18 },
  completeTitle: { color: '#145DA0', fontSize: 20, fontWeight: '700' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 24, 38, 0.62)', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 430, gap: 10, borderLeftWidth: 4, borderLeftColor: '#E66D6D', backgroundColor: '#FFF3F1', padding: 18, borderRadius: 20 },
  confirmTitle: { color: '#8C2F39', fontSize: 20, fontWeight: '700' },
  confirmText: { color: '#5F4A4D', fontSize: 14, lineHeight: 20 },
});
