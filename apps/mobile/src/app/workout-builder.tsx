import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { assertValidWorkout, expandWorkoutTimeline, type StepGoal, type WorkoutBlock, type WorkoutDefinition } from '@pacelab/domain';
import { ActionButton, BodyText, ButtonRow, Eyebrow, Metric, RunScreen, ScreenTitle } from '@/components/run-ui';
import { formatMilliseconds } from '@/lib/format';

type GoalMode = 'TIME' | 'DISTANCE';
type DraftBlock = { mode: GoalMode; work: string; sets: string; recovery: string };
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="numeric" style={styles.input} /></View>; }
const positive = (value: string, fallback: number) => Math.max(1, Number(value) || fallback);

export default function WorkoutBuilderScreen() {
  const [name, setName] = useState('Interval ของฉัน');
  const [warmup, setWarmup] = useState('10');
  const [cooldown, setCooldown] = useState('10');
  const [message, setMessage] = useState('เพิ่มบล็อกได้ไม่จำกัด เพื่อสร้าง workout หลายช่วง');
  const [blocks, setBlocks] = useState<DraftBlock[]>([{ mode: 'DISTANCE', work: '300', sets: '10', recovery: '90' }, { mode: 'DISTANCE', work: '200', sets: '6', recovery: '60' }]);
  const updateBlock = (index: number, patch: Partial<DraftBlock>) => setBlocks((current) => current.map((block, i) => i === index ? { ...block, ...patch } : block));
  const buildWorkout = (): WorkoutDefinition => {
    const goal = (block: DraftBlock): StepGoal => block.mode === 'TIME' ? { type: 'TIME', durationMs: positive(block.work, 1) * 60_000 } : { type: 'DISTANCE', distanceM: positive(block.work, 100) };
    const workoutBlocks: WorkoutBlock[] = blocks.map((block, index) => ({ id: `block-${index + 1}`, repeatCount: positive(block.sets, 1), workSteps: [{ id: `work-${index + 1}`, kind: 'WORK', goal: goal(block) }], recovery: { id: `recovery-${index + 1}`, kind: 'RECOVERY', goal: { type: 'TIME', durationMs: positive(block.recovery, 1) * 1000 } } }));
    return { id: 'custom-interval', name: name.trim() || 'Interval ของฉัน', warmup: { id: 'warmup', kind: 'WARMUP', goal: { type: 'TIME', durationMs: positive(warmup, 10) * 60_000 } }, blocks: workoutBlocks, cooldown: { id: 'cooldown', kind: 'COOLDOWN', goal: { type: 'TIME', durationMs: positive(cooldown, 10) * 60_000 } } };
  };
  const preview = () => { try { const workout = buildWorkout(); assertValidWorkout(workout); router.push({ pathname: '/workout-preview', params: { workout: JSON.stringify(workout), draft: '1' } }); } catch (error) { setMessage(error instanceof Error ? error.message : 'ตรวจสอบข้อมูลอีกครั้ง'); } };
  const timeline = expandWorkoutTimeline(buildWorkout());
  const totalTime = timeline.every((step) => step.goal.type === 'TIME') ? timeline.reduce((sum, step) => sum + (step.goal.type === 'TIME' ? step.goal.durationMs : 0), 0) : null;
  return <RunScreen><Eyebrow>Workout Builder</Eyebrow><ScreenTitle>สร้าง Interval</ScreenTitle><BodyText>{message}</BodyText><TextInput value={name} onChangeText={setName} placeholder="ชื่อ workout" placeholderTextColor="#829AB1" style={styles.nameInput} />
    <View style={styles.card}><View style={styles.row}><Text style={styles.cardTitle}>โครงสร้างการซ้อม</Text><Text style={styles.count}>{blocks.length} ช่วง</Text></View>{blocks.map((block, index) => <View key={index} style={styles.block}><View style={styles.row}><Text style={styles.blockTitle}>ช่วงที่ {index + 1}</Text>{blocks.length > 1 && <Text style={styles.remove} onPress={() => setBlocks((current) => current.filter((_, i) => i !== index))}>ลบ</Text>}</View><ButtonRow><ActionButton label="ระยะทาง" tone={block.mode === 'DISTANCE' ? 'primary' : 'secondary'} onPress={() => updateBlock(index, { mode: 'DISTANCE' })} /><ActionButton label="เวลา" tone={block.mode === 'TIME' ? 'primary' : 'secondary'} onPress={() => updateBlock(index, { mode: 'TIME' })} /></ButtonRow><Field label={block.mode === 'DISTANCE' ? 'Work (เมตร)' : 'Work (นาที)'} value={block.work} onChange={(value) => updateBlock(index, { work: value })} /><Field label="จำนวนเซต" value={block.sets} onChange={(value) => updateBlock(index, { sets: value })} /><Field label="พัก (วินาที)" value={block.recovery} onChange={(value) => updateBlock(index, { recovery: value })} /></View>)}<ActionButton label="＋ เพิ่มช่วงใหม่" tone="secondary" onPress={() => setBlocks((current) => [...current, { mode: 'DISTANCE', work: '400', sets: '4', recovery: '90' }])} /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>ก่อนและหลังวิ่ง</Text><Field label="วอร์มอัพ (นาที)" value={warmup} onChange={setWarmup} /><Field label="คูลดาวน์ (นาที)" value={cooldown} onChange={setCooldown} /></View><View style={styles.summary}><Metric label="จำนวนช่วง" value={`${timeline.length}`} /><Metric label="เวลารวม" value={totalTime === null ? 'ตามระยะทาง' : formatMilliseconds(totalTime)} /></View><ActionButton label="ดู Preview ก่อนบันทึก" onPress={preview} /></RunScreen>;
}
const styles = StyleSheet.create({
  nameInput: { backgroundColor: '#FFFFFF', borderColor: '#DDE4EA', borderWidth: 1, borderRadius: 0, padding: 15, color: '#191D23', fontSize: 18 },
  card: { gap: 14, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 0, padding: 18, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#191D23', fontSize: 17, fontWeight: '800' },
  count: { color: '#299F92', fontWeight: '800' },
  block: { gap: 10, backgroundColor: '#F4F7F9', borderColor: '#E8EDF1', borderWidth: 1, borderRadius: 0, padding: 14 },
  blockTitle: { color: '#299F92', fontSize: 16, fontWeight: '900' },
  remove: { color: '#D45F63', fontWeight: '800' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { color: '#586575', fontSize: 15, flex: 1 },
  input: { width: 90, backgroundColor: '#FFFFFF', borderColor: '#DDE4EA', borderWidth: 1, borderRadius: 0, padding: 9, textAlign: 'center', color: '#191D23', fontSize: 17 },
  summary: { flexDirection: 'row', gap: 12 },
});
