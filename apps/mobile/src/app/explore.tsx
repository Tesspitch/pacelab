import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';

const activities = [
  { title: 'Free Run', detail: 'วิ่งตามจังหวะของคุณ พร้อมปรับความเร็วแบบอิสระ', accent: '#43C7B5' },
  { title: 'Interval Builder', detail: 'ออกแบบช่วงวิ่ง-พักให้เหมาะกับเป้าหมายและความฟิต', accent: '#1E6F73' },
  { title: 'Recovery Insight', detail: 'บันทึกการฟื้นตัวและติดตามความคงที่ของการฝึก', accent: '#8AB39D' },
];

const stats = [
  { label: 'สัปดาห์นี้', value: '4' },
  { label: 'ระยะทาง', value: '16.8 KM' },
  { label: 'pace เฉลี่ย', value: '5:12' },
];

export default function ExploreScreen() {
  return (
    <RunScreen>
      <Eyebrow>paceLab</Eyebrow>
      <ScreenTitle>สำรวจการฝึก</ScreenTitle>

      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>TRAIN SMARTER</Text>
        <Text style={styles.heroTitle}>ทุกเซสชัน คิดเพื่อผลลัพธ์</Text>
        <Text style={styles.heroBody}>สร้างความคงที่ของการวิ่ง ด้วยแผนที่ชัดเจน สอดคล้องกับสภาพร่างกายและเป้าหมายของคุณ</Text>
        <ActionButton label="เริ่มวันใหม่" onPress={() => router.push('/run-start')} />
      </View>

      <View style={styles.metricRow}>
        {stats.map((item) => (
          <View key={item.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{item.label}</Text>
            <Text style={styles.metricValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>กิจกรรมที่แนะนำ</Text>
        {activities.map((item) => (
          <Pressable key={item.title} style={styles.listRow}>
            <View style={[styles.dot, { backgroundColor: item.accent }]} />
            <View style={styles.listTextWrap}>
              <Text style={styles.listTitle}>{item.title}</Text>
              <Text style={styles.listDetail}>{item.detail}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>การวางแผน</Text>
        <View style={styles.scheduleRow}>
          <View style={styles.scheduleLabelBox}>
            <Text style={styles.scheduleLabel}>Mon</Text>
          </View>
          <View style={styles.scheduleLabelBox}>
            <Text style={styles.scheduleLabel}>Tue</Text>
          </View>
          <View style={styles.scheduleLabelBoxActive}>
            <Text style={styles.scheduleLabelActive}>Wed</Text>
          </View>
          <View style={styles.scheduleLabelBox}>
            <Text style={styles.scheduleLabel}>Thu</Text>
          </View>
        </View>
        <Text style={styles.scheduleText}>วันพุธ · Session 3 · Interval + 15 นาที recovery walk</Text>
      </View>
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E9EE',
    borderWidth: 1,
    borderRadius: 28,
    padding: 22,
    shadowColor: '#233242',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroKicker: {
    color: '#2AA69D',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heroTitle: {
    color: '#191D23',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heroBody: {
    color: '#667282',
    fontSize: 15,
    lineHeight: 22,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E9EE',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    color: '#697584',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    color: '#191D23',
    fontSize: 24,
    fontWeight: '700',
  },
  sectionCard: {
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E9EE',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  sectionTitle: {
    color: '#191D23',
    fontSize: 20,
    fontWeight: '700',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  listTextWrap: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    color: '#191D23',
    fontSize: 17,
    fontWeight: '700',
  },
  listDetail: {
    color: '#667282',
    fontSize: 14,
    lineHeight: 20,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scheduleLabelBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#F5F7FA',
    borderColor: '#E2E8EE',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleLabel: {
    color: '#58687B',
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleLabelBoxActive: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#E7F9F6',
    borderColor: '#43C7B5',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleLabelActive: {
    color: '#0B6A62',
    fontSize: 14,
    fontWeight: '800',
  },
  scheduleText: {
    color: '#667282',
    fontSize: 14,
    lineHeight: 20,
  },
});
