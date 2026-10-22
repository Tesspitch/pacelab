import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BodyText, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { getAllCompletedSessions, type RecentSession } from '@/lib/database';
import { formatDistance, formatMilliseconds } from '@/lib/format';

type RangeFilter = '7days' | '30days' | 'year';

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2024, month, 1).toLocaleDateString('th-TH', { month: 'long' }),
);

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [range, setRange] = useState<RangeFilter>('7days');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getAllCompletedSessions()
      .then((items) => {
        setSessions(items);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'โหลดประวัติไม่สำเร็จ');
      });
  }, []);

  useFocusEffect(refresh);

  const monthCounts = useMemo(() => {
    const counts = Array<number>(12).fill(0);
    for (const session of sessions) {
      const date = new Date(session.startedAt);
      if (date.getFullYear() === selectedYear) counts[date.getMonth()] += 1;
    }
    return counts;
  }, [sessions, selectedYear]);

  const chartData = useMemo(() => {
    if (range === 'year' && selectedMonth === null) {
      return monthNames.map((name, month) => ({
        key: `month-${month}`,
        label: new Date(2024, month, 1).toLocaleDateString('th-TH', { month: 'short' }),
        distanceM: sessions.reduce((total, session) => {
          const date = new Date(session.startedAt);
          return date.getFullYear() === selectedYear && date.getMonth() === month
            ? total + session.distanceM
            : total;
        }, 0),
      }));
    }

    const now = new Date();
    const start = range === 'year'
      ? new Date(selectedYear, selectedMonth ?? 0, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range === '7days' ? 6 : 29));
    const count = range === 'year'
      ? new Date(selectedYear, (selectedMonth ?? 0) + 1, 0).getDate()
      : range === '7days' ? 7 : 30;

    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return {
        key,
        label: range === '7days' ? date.toLocaleDateString('th-TH', { weekday: 'short' }) : String(date.getDate()),
        distanceM: sessions.reduce((total, session) => {
          const sessionDate = new Date(session.startedAt);
          return sessionDate.getFullYear() === date.getFullYear()
            && sessionDate.getMonth() === date.getMonth()
            && sessionDate.getDate() === date.getDate()
            ? total + session.distanceM
            : total;
        }, 0),
      };
    });
  }, [range, selectedMonth, selectedYear, sessions]);

  const filteredSessions = useMemo(() => {
    const today = new Date();
    if (range === 'year') {
      return sessions.filter((session) => {
        const date = new Date(session.startedAt);
        return date.getFullYear() === selectedYear
          && (selectedMonth === null || date.getMonth() === selectedMonth);
      });
    }

    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - (range === '7days' ? 6 : 29));
    return sessions.filter((session) => new Date(session.startedAt) >= start);
  }, [range, selectedMonth, selectedYear, sessions]);

  const setRangeFilter = (value: RangeFilter) => {
    setRange(value);
    setSelectedMonth(null);
    if (value === 'year') setSelectedYear(new Date().getFullYear());
  };

  return (
    <RunScreen>
      <Eyebrow>History</Eyebrow>
      <ScreenTitle>ประวัติการวิ่ง</ScreenTitle>
      <View style={styles.filters}>
        <FilterButton label="7 วัน" selected={range === '7days'} onPress={() => setRangeFilter('7days')} />
        <FilterButton label="30 วัน" selected={range === '30days'} onPress={() => setRangeFilter('30days')} />
        <FilterButton label="รายปี" selected={range === 'year'} onPress={() => setRangeFilter('year')} />
      </View>
      <DistanceChart data={chartData} />
      {range === 'year' && (
        <>
          <View style={styles.yearHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="ปีก่อนหน้า" style={styles.yearArrow} onPress={() => { setSelectedYear((year) => year - 1); setSelectedMonth(null); }}>
              <Text style={styles.yearArrowText}>‹</Text>
            </Pressable>
            <Text style={styles.yearLabel}>{new Date(selectedYear, 0, 1).toLocaleDateString('th-TH', { year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="ปีถัดไป" style={styles.yearArrow} onPress={() => { setSelectedYear((year) => Math.min(year + 1, new Date().getFullYear())); setSelectedMonth(null); }}>
              <Text style={styles.yearArrowText}>›</Text>
            </Pressable>
          </View>
          {selectedMonth !== null && (
            <Pressable style={styles.allMonths} onPress={() => setSelectedMonth(null)}>
              <Text style={styles.allMonthsText}>‹  กลับไปเลือกเดือน</Text>
            </Pressable>
          )}
          {selectedMonth === null && (
            <View style={styles.monthGrid}>
              {monthNames.map((name, month) => (
                <Pressable key={name} style={styles.monthCell} onPress={() => setSelectedMonth(month)}>
                  <Text style={styles.monthName}>{name}</Text>
                  <Text style={styles.monthCount}>{monthCounts[month]} กิจกรรม</Text>
                </Pressable>
              ))}
            </View>
          )}
          {selectedMonth !== null && <Text style={styles.monthHeading}>{monthNames[selectedMonth]} {selectedYear + 543}</Text>}
        </>
      )}
      {loadError && <BodyText>โหลดประวัติไม่สำเร็จ: {loadError}</BodyText>}
      <View style={styles.card}>
        {filteredSessions.length === 0 ? (
          <Text style={styles.empty}>
            {sessions.length === 0
              ? 'ยังไม่มีการวิ่งที่บันทึกไว้\nเมื่อจบกิจกรรม คุณจะพบประวัติที่นี่'
              : 'ไม่มีรายการในช่วงเวลาที่เลือก'}
          </Text>
        ) : filteredSessions.map((session) => (
          <Pressable
            key={session.id}
            style={styles.row}
            onPress={() => router.push({ pathname: '/activity/[id]', params: { id: session.id } })}>
            <View style={styles.info}>
              <Text style={styles.title}>{session.mode === 'free_run' ? 'Run' : 'Interval'}</Text>
              <Text style={styles.meta}>{new Date(session.startedAt).toLocaleDateString('th-TH')} · {formatMilliseconds(session.elapsedMs)}</Text>
            </View>
            <Text style={styles.distance}>{formatDistance(session.distanceM)}</Text>
          </Pressable>
        ))}
      </View>
    </RunScreen>
  );
}

function FilterButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} style={[styles.filterButton, selected && styles.filterButtonSelected]} onPress={onPress}>
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function DistanceChart({ data }: { data: { key: string; label: string; distanceM: number }[] }) {
  const maxDistance = Math.max(0, ...data.map((item) => item.distanceM));
  const totalDistance = data.reduce((sum, item) => sum + item.distanceM, 0);
  const scale = maxDistance > 0 ? maxDistance : 1;
  const labelEvery = data.length > 20 ? 5 : data.length > 12 ? 3 : 1;

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>ระยะทาง</Text>
        <Text style={styles.chartTotal}>{formatDistance(totalDistance)}</Text>
      </View>
      <View style={styles.chartPlot}>
        <View style={[styles.gridLine, { bottom: '50%' }]} />
        <View style={[styles.gridLine, { bottom: '100%' }]} />
        {data.map((item, index) => {
          const heightPercent = item.distanceM > 0 ? Math.max(6, (item.distanceM / scale) * 100) : 0;
          return (
            <View key={item.key} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${heightPercent}%` }]} />
              </View>
              <Text style={styles.barLabel}>
                {index % labelEvery === 0 || index === data.length - 1 ? item.label : ''}
              </Text>
            </View>
          );
        })}
      </View>
      {maxDistance === 0 && <Text style={styles.chartEmpty}>ยังไม่มีระยะทางในช่วงนี้</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8 },
  filterButton: { flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#DDE4EA', backgroundColor: '#FFFFFF' },
  filterButtonSelected: { borderColor: '#43C7B5', backgroundColor: '#DFF5EF' },
  filterText: { color: '#586575', fontSize: 14, fontWeight: '700' },
  filterTextSelected: { color: '#168B80' },
  yearHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  yearArrow: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E9EE' },
  yearArrowText: { color: '#303945', fontSize: 25, lineHeight: 28 },
  yearLabel: { color: '#191D23', fontSize: 18, fontWeight: '800' },
  allMonths: { alignSelf: 'flex-start', paddingVertical: 4 },
  allMonthsText: { color: '#159E9A', fontSize: 14, fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: { width: '31%', minHeight: 66, justifyContent: 'center', alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 1, borderColor: '#E5E9EE', backgroundColor: '#FFFFFF', paddingHorizontal: 4 },
  monthName: { color: '#303945', fontSize: 14, fontWeight: '700' },
  monthCount: { color: '#667282', fontSize: 11 },
  monthHeading: { color: '#191D23', fontSize: 17, fontWeight: '800' },
  chartCard: { gap: 12, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 20, padding: 16, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartTitle: { color: '#303945', fontSize: 15, fontWeight: '800' },
  chartTotal: { color: '#168B80', fontSize: 14, fontWeight: '800' },
  chartPlot: { height: 124, flexDirection: 'row', alignItems: 'stretch', gap: 3, position: 'relative', paddingTop: 4 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#EDF1F4' },
  barColumn: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  barTrack: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#DDE4EA' },
  bar: { width: '72%', minHeight: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: '#43C7B5' },
  barLabel: { width: '100%', height: 14, color: '#667282', fontSize: 9, textAlign: 'center' },
  chartEmpty: { color: '#8290A0', fontSize: 12, textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#E7EBF0', borderBottomWidth: 1 },
  info: { flex: 1, gap: 4 },
  title: { color: '#191D23', fontSize: 16, fontWeight: '700' },
  meta: { color: '#667282', fontSize: 13 },
  distance: { color: '#299F92', fontSize: 17, fontWeight: '700' },
  empty: { color: '#667282', paddingVertical: 40, paddingHorizontal: 12, lineHeight: 24, textAlign: 'center' },
});
