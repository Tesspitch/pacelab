import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { WorkoutDefinition } from '@pacelab/domain';
import { ActionButton, BodyText, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { getCustomWorkout } from '@/lib/database';

export default function RunStartScreen() {
  const [customWorkout, setCustomWorkout] = useState<WorkoutDefinition | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { void getCustomWorkout().then(setCustomWorkout).catch((error) => setLoadError(error instanceof Error ? error.message : 'โหลด preset ไม่สำเร็จ')); }, []);
  const options = customWorkout ? [customWorkout] : [];
  const selected = options.find((item) => item.id === selectedId) ?? customWorkout;
  return <RunScreen><Eyebrow>เริ่มกิจกรรม</Eyebrow><ScreenTitle>เลือกการวิ่ง</ScreenTitle>{loadError && <BodyText>โหลด preset ไม่สำเร็จ: {loadError}</BodyText>}
    <View style={styles.card}><Text style={styles.kicker}>RUN</Text><Text style={styles.title}>Free Run</Text><Text style={styles.empty}>วิ่งในจังหวะของคุณ เลือกเส้นทางได้ตามใจ</Text><ActionButton label="เลือก Free Run →" onPress={() => router.push('/free-run')} /></View>
    <View style={styles.card}><Text style={styles.kicker}>INTERVAL</Text><Text style={styles.title}>Interval Training</Text><Text style={styles.empty}>สลับวิ่งและพัก ตามแผนที่คุณออกแบบ</Text>
      {selected ? <><Pressable style={styles.dropdown} onPress={() => setMenuOpen(true)}><Text style={styles.presetTitle}>{selected.name}</Text><Text style={styles.chevron}>⌄</Text></Pressable>
      <ActionButton label="แก้ไขแผน Interval" tone="secondary" onPress={() => router.push({ pathname: '/workout-builder', params: { workout: JSON.stringify(selected) } })} />
      <ActionButton label="เริ่ม Interval" tone="danger" onPress={() => router.push({ pathname: '/workout-preview', params: { workout: JSON.stringify(selected) } })} /></> : <Text style={styles.empty}>ยังไม่มี preset · สร้าง preset ของคุณก่อนเริ่ม Interval</Text>}
      <ActionButton label="+ สร้างแผน Interval" tone="secondary" onPress={() => router.push('/workout-builder')} />
    </View>
    <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}><View style={styles.menu}><Text style={styles.menuTitle}>เลือก Interval</Text>{options.map((item) => <Pressable key={item.id} style={styles.menuItem} onPress={() => { setSelectedId(item.id); setMenuOpen(false); }}><Text style={styles.menuText}>{item.name}</Text></Pressable>)}</View></Pressable></Modal>
  </RunScreen>;
}
const styles = StyleSheet.create({ card: { gap: 12, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 24, padding: 22 }, kicker: { color: '#299F92', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 }, title: { color: '#191D23', fontSize: 26, fontWeight: '700' }, empty: { color: '#667282', fontSize: 15, lineHeight: 22, paddingVertical: 8 }, dropdown: { borderRadius: 16, gap: 10, minHeight: 54, backgroundColor: '#F4F7F9', borderColor: '#43C7B5', borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, presetTitle: { flex: 1, color: '#303945', fontWeight: '800' }, chevron: { color: '#159E9A', fontSize: 24 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,25,35,.45)', justifyContent: 'center', padding: 24 }, menu: { borderRadius: 24, backgroundColor: '#FFFFFF', padding: 18, gap: 8 }, menuTitle: { color: '#191D23', fontSize: 20, fontWeight: '700' }, menuItem: { borderRadius: 14, minHeight: 52, padding: 16, borderColor: '#E1E6EB', borderWidth: 1 }, menuText: { color: '#191D23', fontWeight: '800' } });
