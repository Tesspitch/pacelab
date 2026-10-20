import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { createFreeRunState, finishFreeRun, getFreeRunElapsedMs, observeFreeRun, pauseFreeRun, resumeFreeRun, startFreeRun } from '@pacelab/domain';

import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { createLocalSession, finishLocalSession, recordSessionEvent, setSessionPaused } from '@/lib/database';
import { formatMilliseconds } from '@/lib/format';

export default function FreeRunScreen() {
  const [run, setRun] = useState(createFreeRunState);
  const [clockMs, setClockMs] = useState(() => performance.now());
  const [message, setMessage] = useState('พร้อมเริ่มแบบ timer-only; GPS จะถูกพัฒนาและตรวจความแม่นยำใน Phase 3');
  const sessionId = useRef<string | null>(null);
  const eventSequence = useRef(0);

  useEffect(() => {
    if (run.status !== 'ACTIVE') return;
    const timer = setInterval(() => {
      const now = performance.now();
      setClockMs(now);
      setRun((current) => observeFreeRun(current, now));
    }, 250);
    return () => clearInterval(timer);
  }, [run.status]);

  const recordEvent = (type: string, elapsedMs: number) => {
    if (!sessionId.current) return;
    eventSequence.current += 1;
    void recordSessionEvent({ sessionId: sessionId.current, sequence: eventSequence.current, type, elapsedMs });
  };

  const start = async () => {
    try {
      sessionId.current = await createLocalSession({ mode: 'free_run', runType: 'general' });
      const now = performance.now();
      setClockMs(now);
      setRun((current) => startFreeRun(current, now));
      recordEvent('start', 0);
      setMessage('กำลังบันทึกในเครื่อง · GPS ยังไม่ถูกรวมใน Phase 2 core');
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
    if (sessionId.current) void setSessionPaused(sessionId.current, true);
  };

  const resume = () => {
    const now = performance.now();
    setRun((current) => resumeFreeRun(current, now));
    setClockMs(now);
    recordEvent('resume', getFreeRunElapsedMs(run, now));
    if (sessionId.current) void setSessionPaused(sessionId.current, false);
  };

  const finish = async () => {
    if (!sessionId.current) return;
    const now = performance.now();
    const finished = finishFreeRun(run, now);
    setRun(finished);
    setClockMs(now);
    recordEvent('finish', finished.finalElapsedMs ?? 0);
    await finishLocalSession({ sessionId: sessionId.current, elapsedMs: finished.finalElapsedMs ?? 0 });
    setMessage('บันทึกกิจกรรมลง SQLite สำเร็จ');
  };

  const elapsedMs = getFreeRunElapsedMs(run, clockMs);
  return (
    <RunScreen>
      <Eyebrow>Free Run · {run.status}</Eyebrow>
      <ScreenTitle>วิ่งอิสระ</ScreenTitle>
      <Metric label="Duration" value={formatMilliseconds(elapsedMs)} hero />
      <View style={styles.metrics}>
        <Metric label="Distance" value="— km" />
        <Metric label="Current pace" value="--:--" />
      </View>
      <BodyText>{message}</BodyText>
      {run.status === 'READY' && <ActionButton label="เริ่มจับเวลา" onPress={() => void start()} />}
      {run.status === 'ACTIVE' && <ButtonRow><ActionButton label="พัก" tone="secondary" onPress={pause} /><ActionButton label="จบและบันทึก" tone="danger" onPress={() => void finish()} /></ButtonRow>}
      {run.status === 'PAUSED' && <ButtonRow><ActionButton label="วิ่งต่อ" onPress={resume} /><ActionButton label="จบและบันทึก" tone="danger" onPress={() => void finish()} /></ButtonRow>}
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
  completeCard: { gap: 14, borderRadius: 18, backgroundColor: '#123127', padding: 18 },
  completeTitle: { color: '#A7F3D0', fontSize: 20, fontWeight: '900' },
});
