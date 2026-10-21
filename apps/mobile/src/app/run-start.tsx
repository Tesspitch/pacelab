import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { WorkoutDefinition } from '@pacelab/domain';
import { ActionButton, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { getCustomWorkout } from '@/lib/database';
import { sampleWorkout } from '@/lib/sample-workout';

export default function RunStartScreen() {
  const [customWorkout, setCustomWorkout] = useState<WorkoutDefinition | null>(null);
  const [selectedId, setSelectedId] = useState(sampleWorkout.id);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { void getCustomWorkout<WorkoutDefinition>().then(setCustomWorkout).catch(() => undefined); }, []);
  const options = [sampleWorkout, ...(customWorkout ? [customWorkout] : [])];
  const selected = options.find((item) => item.id === selectedId) ?? options[0];
  return <RunScreen><Eyebrow>เริ่มกิจกรรม</Eyebrow><ScreenTitle>เลือกการวิ่ง</ScreenTitle>
    <View style={styles.card}><Text style={styles.kicker}>RUN</Text><Text style={styles.title}>วิ่งปกติ</Text><ActionButton label="เริ่ม Run" onPress={() => router.push('/free-run')} /></View>
    <View style={styles.card}><Text style={styles.kicker}>INTERVAL</Text><Text style={styles.title}>เลือก workout</Text>
      <Pressable style={styles.dropdown} onPress={() => setMenuOpen(true)}><Text style={styles.presetTitle}>{selected.name}</Text><Text style={styles.chevron}>⌄</Text></Pressable>
      <ActionButton label="เริ่ม Interval" tone="danger" onPress={() => router.push({ pathname: '/workout-preview', params: { workout: JSON.stringify(selected) } })} />
      <ActionButton label="สร้าง preset ใหม่" tone="secondary" onPress={() => router.push('/workout-builder')} />
    </View>
    <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}><View style={styles.menu}><Text style={styles.menuTitle}>เลือก Interval</Text>{options.map((item) => <Pressable key={item.id} style={styles.menuItem} onPress={() => { setSelectedId(item.id); setMenuOpen(false); }}><Text style={styles.menuText}>{item.name}</Text></Pressable>)}</View></Pressable></Modal>
  </RunScreen>;
}
const styles = StyleSheet.create({ card: { gap: 12, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 0, padding: 20 }, kicker: { color: '#299F92', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 }, title: { color: '#191D23', fontSize: 27, fontWeight: '900' }, dropdown: { minHeight: 54, backgroundColor: '#F4F7F9', borderColor: '#43C7B5', borderWidth: 2, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, presetTitle: { color: '#303945', fontWeight: '800' }, chevron: { color: '#159E9A', fontSize: 24 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,25,35,.45)', justifyContent: 'center', padding: 24 }, menu: { backgroundColor: '#FFFFFF', padding: 18, gap: 8 }, menuTitle: { color: '#191D23', fontSize: 20, fontWeight: '900' }, menuItem: { padding: 16, borderColor: '#E1E6EB', borderWidth: 1 }, menuText: { color: '#191D23', fontWeight: '800' } });
