import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { getRecentCompletedSessions, type RecentSession } from '@/lib/database';
import { formatDistance, formatMilliseconds } from '@/lib/format';

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const refresh = useCallback(() => { void getRecentCompletedSessions(20).then(setSessions).catch(() => undefined); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <RunScreen><Eyebrow>History</Eyebrow><ScreenTitle>ประวัติการวิ่ง</ScreenTitle><View style={styles.card}>{sessions.length === 0 ? <Text style={styles.empty}>ยังไม่มีประวัติ</Text> : sessions.map((session) => <Pressable key={session.id} style={styles.row} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: session.id } })}><View style={styles.info}><Text style={styles.title}>{session.mode === 'free_run' ? 'Run' : 'Interval'}</Text><Text style={styles.meta}>{new Date(session.startedAt).toLocaleDateString('th-TH')} · {formatMilliseconds(session.elapsedMs)}</Text></View><Text style={styles.distance}>{formatDistance(session.distanceM)}</Text></Pressable>)}</View><ActionButton label="กลับหน้าหลัก" tone="secondary" onPress={() => router.replace('/')} /></RunScreen>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 0, paddingHorizontal: 16, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#E7EBF0', borderBottomWidth: 1 }, info: { flex: 1, gap: 4 }, title: { color: '#191D23', fontSize: 16, fontWeight: '900' }, meta: { color: '#667282', fontSize: 13 }, distance: { color: '#299F92', fontWeight: '900' }, empty: { color: '#667282', padding: 20 } });
