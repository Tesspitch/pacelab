import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, BodyText, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { getCompletedSessionCount, initializeDatabase } from '@/lib/database';

type LocationState = 'not-requested' | 'granted' | 'denied';

export default function HomeScreen() {
  const [databaseState, setDatabaseState] = useState('กำลังเตรียมฐานข้อมูล…');
  const [completedCount, setCompletedCount] = useState(0);
  const [locationState, setLocationState] = useState<LocationState>('not-requested');

  const refreshCount = useCallback(() => {
    void getCompletedSessionCount().then(setCompletedCount).catch(() => undefined);
  }, []);

  useEffect(() => {
    void initializeDatabase()
      .then(() => {
        setDatabaseState('SQLite พร้อมใช้งานแบบออฟไลน์');
        refreshCount();
      })
      .catch((error: unknown) => {
        setDatabaseState(`เปิด SQLite ไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
  }, [refreshCount]);

  useFocusEffect(refreshCount);

  const requestLocation = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationState(result.granted ? 'granted' : 'denied');
  };

  return (
    <RunScreen>
      <Eyebrow>PaceLab V6.4 · Offline first</Eyebrow>
      <ScreenTitle>วิ่งได้โดยไม่ต้องมีนาฬิกา</ScreenTitle>
      <BodyText>เลือก Free Run เพื่อเริ่มทันที หรือดูแผน Speedwork แบบเต็มก่อนเริ่ม ทุกเวลาอ้างอิง monotonic clock ไม่ใช่การนับ tick สะสม</BodyText>
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>สถานะเครื่อง</Text>
        <Text style={styles.statusText}>{databaseState}</Text>
        <Text style={styles.statusText}>กิจกรรมที่บันทึกจบแล้ว: {completedCount}</Text>
        <Text style={styles.statusText}>Location: {locationState}</Text>
        <ActionButton label="ตรวจสิทธิ์ตำแหน่งขณะใช้แอป" tone="secondary" onPress={() => void requestLocation()} />
      </View>
      <View style={styles.modeCard}>
        <Text style={styles.modeKicker}>FREE RUN</Text>
        <Text style={styles.modeTitle}>เริ่มวิ่งอิสระ</Text>
        <Text style={styles.modeBody}>เวลา · ระยะทาง · current pace โดยค่าที่ GPS ยังไม่พร้อมจะแสดงเป็น —</Text>
        <ActionButton label="Start Free Run" onPress={() => router.push('/free-run')} />
      </View>
      <View style={styles.modeCard}>
        <Text style={styles.modeKicker}>SPEEDWORK</Text>
        <Text style={styles.modeTitle}>6 × 3:00 / พัก 2:00</Text>
        <Text style={styles.modeBody}>วอร์ม 10 นาที · Work 6 เซต · Recovery 5 ครั้ง · คูลดาวน์ 10 นาที</Text>
        <ActionButton label="ดู Timeline 48:00" tone="secondary" onPress={() => router.push('/workout-preview')} />
      </View>
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  statusCard: { gap: 10, borderRadius: 18, borderColor: '#24304A', borderWidth: 1, padding: 16 },
  statusTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800' },
  statusText: { color: '#91A3BA', fontSize: 14 },
  modeCard: { gap: 12, borderRadius: 24, backgroundColor: '#11182A', padding: 22 },
  modeKicker: { color: '#5EEAD4', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  modeTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  modeBody: { color: '#9AA9BD', fontSize: 15, lineHeight: 22 },
});
