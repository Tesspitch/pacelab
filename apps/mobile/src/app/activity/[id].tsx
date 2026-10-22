import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { useAppTheme } from '@/components/app-theme';
import { deleteCompletedSession, getActivityDetail, getActivityGpsPoints, getActivityLaps, type ActivityDetail, type ActivityGpsPoint, type ActivityLap } from '@/lib/database';
import { formatDistance, formatMilliseconds, formatPaceSecondsPerKm } from '@/lib/format';
import { createActivityShare } from '@/lib/activity-sharing';

function elevationGain(points: ActivityGpsPoint[]) {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1];
    return previous?.altitudeM !== null && point.altitudeM !== null && point.altitudeM > previous.altitudeM ? total + point.altitudeM - previous.altitudeM : total;
  }, 0);
}

function samplePoints(points: ActivityGpsPoint[], maxPoints = 320): ActivityGpsPoint[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]).filter((point): point is ActivityGpsPoint => Boolean(point));
}

export default function ActivityDetailScreen() {
  const { mode } = useAppTheme();
  const light = mode === 'light';
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [points, setPoints] = useState<ActivityGpsPoint[]>([]);
  const [laps, setLaps] = useState<ActivityLap[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const shareCardRef = useRef<any>(null);
  useEffect(() => { if (id) void Promise.all([getActivityDetail(id), getActivityGpsPoints(id), getActivityLaps(id)]).then(([detail, gps, storedLaps]) => { setActivity(detail); setPoints(gps); setLaps(storedLaps); }).catch((error) => { console.warn('Unable to load activity', error); setActivity(null); }); }, [id]);
  const pace = activity && activity.distanceM > 0 ? activity.elapsedMs / 1000 / (activity.distanceM / 1000) : null;
  const routePoints = useMemo(() => samplePoints(points), [points]);
  const route = useMemo(() => routePoints.length > 1 ? routePoints.map((point) => ({ x: point.longitude, y: point.latitude })) : [], [routePoints]);
  const shareActivity = async () => {
    if (!activity) return;
    const distance = formatDistance(activity.distanceM);
    const duration = formatMilliseconds(activity.elapsedMs);
    const paceText = formatPaceSecondsPerKm(pace);
    try {
      let shareUrl = '';
      try { shareUrl = (await createActivityShare(activity.id)).url; } catch (error) { console.warn('Cloud share unavailable', error); }
      const message = `ผลการวิ่ง PaceLab\nระยะทาง ${distance}\nเวลา ${duration}\nเพซเฉลี่ย ${paceText}${shareUrl ? `\n\nดูผลซ้อม: ${shareUrl}` : ''}`;
      await Share.share({ title: 'PaceLab · ผลการวิ่ง', message });
    } catch (error) {
      console.warn('Unable to share activity', error);
    }
  };
  const shareActivityImage = async () => {
    if (!activity) return;
    try {
      const uri = await shareCardRef.current?.capture?.({ format: 'png', quality: 1, result: 'tmpfile' });
      if (!uri) return;
      if (Platform.OS === 'web') { const anchor = document.createElement('a'); anchor.href = uri; anchor.download = `pacelab-${activity.id}.png`; anchor.click(); return; }
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'แชร์การ์ดผลการวิ่ง' });
    } catch (error) {
      console.warn('Unable to share activity image', error);
    }
  };
  const deleteActivity = () => {
    const remove = async () => {
      try {
        await deleteCompletedSession(activity!.id);
        router.replace('/history');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง';
        if (Platform.OS === 'web') window.alert(`ลบกิจกรรมไม่สำเร็จ: ${message}`);
        else Alert.alert('ลบกิจกรรมไม่สำเร็จ', message);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('ต้องการลบกิจกรรมนี้หรือไม่? ข้อมูลที่ลบแล้วจะไม่สามารถกู้คืนได้')) void remove();
      return;
    }
    Alert.alert('ลบกิจกรรม', 'ต้องการลบกิจกรรมนี้หรือไม่? ข้อมูลที่ลบแล้วจะไม่สามารถกู้คืนได้', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบกิจกรรม', style: 'destructive', onPress: () => void remove() },
    ]);
  };
  const minX = route.reduce((value, point) => Math.min(value, point.x), Number.POSITIVE_INFINITY);
  const maxX = route.reduce((value, point) => Math.max(value, point.x), Number.NEGATIVE_INFINITY);
  const minY = route.reduce((value, point) => Math.min(value, point.y), Number.POSITIVE_INFINITY);
  const maxY = route.reduce((value, point) => Math.max(value, point.y), Number.NEGATIVE_INFINITY);
  const routeSegments = useMemo(() => route.slice(1).map((point, index) => {
    const previous = route[index];
    const x1 = 12 + ((previous.x - minX) / Math.max(0.000001, maxX - minX)) * 250;
    const y1 = 12 + (1 - (previous.y - minY) / Math.max(0.000001, maxY - minY)) * 130;
    const x2 = 12 + ((point.x - minX) / Math.max(0.000001, maxX - minX)) * 250;
    const y2 = 12 + (1 - (point.y - minY) / Math.max(0.000001, maxY - minY)) * 130;
    const dx = x2 - x1;
    const dy = y2 - y1;
    return { left: (x1 + x2) / 2, top: (y1 + y2) / 2, length: Math.max(2, Math.sqrt(dx * dx + dy * dy)), angle: Math.atan2(dy, dx) };
  }), [route, minX, maxX, minY, maxY]);
  const paceSeries = useMemo(() => points.slice(1).map((point, index) => {
    const previous = points[index];
    const deltaDistance = point.cumulativeDistanceM - previous.cumulativeDistanceM;
    const deltaTime = (point.timestampMs - previous.timestampMs) / 1000;
    return deltaDistance > 1 && deltaTime > 0 ? deltaTime / (deltaDistance / 1000) : null;
  }).filter((value): value is number => value !== null && Number.isFinite(value)), [points]);
  const elevationSeries = useMemo(() => points.map((point) => point.altitudeM).filter((value): value is number => value !== null && Number.isFinite(value)), [points]);
  if (!activity) return <RunScreen><Eyebrow>Activity</Eyebrow><ScreenTitle>ไม่พบกิจกรรม</ScreenTitle></RunScreen>;
  const date = new Date(activity.startedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  return <RunScreen><Eyebrow>{activity.mode === 'free_run' ? 'RUN' : 'INTERVAL'}</Eyebrow><View style={actionStyles.titleRow}><ScreenTitle>{activity.mode === 'free_run' ? 'Run' : 'Interval'}</ScreenTitle><Pressable accessibilityRole="button" accessibilityLabel="การตั้งค่ากิจกรรม" onPress={() => setActionsOpen(true)} style={actionStyles.moreButton}><Text style={actionStyles.moreButtonText}>⋮</Text></Pressable></View><Text style={[styles.date, light && lightStyles.meta]}>{date}</Text>
    <View style={[styles.routeCard, light && lightStyles.routeCard]}>{route.length > 1 ? <>{routeSegments.map((segment, index) => <View key={`line-${index}`} style={[styles.routeLine, light && lightStyles.routeLine, { left: segment.left - segment.length / 2, top: segment.top - 2, width: segment.length, transform: [{ rotate: `${segment.angle}rad` }] }]} />)}{route.map((point, index) => <View key={`point-${index}`} style={[styles.routePoint, light && lightStyles.routePoint, { left: 12 + ((point.x - minX) / Math.max(0.000001, maxX - minX)) * 250 - 3, top: 12 + (1 - (point.y - minY) / Math.max(0.000001, maxY - minY)) * 130 - 3 }]} />)}</> : <View style={styles.routeGlyph}><Text style={[styles.routeGlyphText, light && lightStyles.routeGlyphText]}>⌁</Text><Text style={[styles.routeEmpty, light && lightStyles.meta]}>ไม่มีเส้นทาง GPS</Text></View>}</View>
    <View style={styles.activityHeader}><Text style={[styles.activityType, light && lightStyles.activityType]}>{activity.mode === 'free_run' ? 'Free Run' : 'Interval'}</Text><Text style={[styles.activityDistance, light && lightStyles.title]}>{formatDistance(activity.distanceM)}</Text></View>
    <View style={[styles.grid, light && lightStyles.panel]}><Stat label="DISTANCE" value={formatDistance(activity.distanceM)} light={light} /><Stat label="TIME" value={formatMilliseconds(activity.elapsedMs)} light={light} /><Stat label="AVG PACE" value={formatPaceSecondsPerKm(pace)} light={light} /><Stat label="ELEVATION" value={points.length ? `${Math.round(elevationGain(points))} m` : '—'} light={light} /><Stat label="CADENCE" value="—" light={light} /><Stat label="AVG HR" value="—" light={light} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="แชร์กิจกรรม" onPress={() => void shareActivity()} style={[styles.share, light && lightStyles.share]}><Text style={[styles.shareText, light && lightStyles.shareText]}>↥  Share</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="แชร์เป็นรูปภาพ" onPress={() => void shareActivityImage()} style={[styles.imageShare, light && lightStyles.imageShare]}><Text style={[styles.imageShareText, light && lightStyles.imageShareText]}>▧  แชร์เป็น PNG โปร่งใส</Text></Pressable>
    <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.shareCard}><Text style={styles.shareCardTitle}>PACELAB · RUN</Text><Text style={styles.shareCardRoute}>{route.length > 1 ? '●  GPS route recorded' : '○  GPS route unavailable'}</Text><View style={styles.shareCardStats}><Text style={styles.shareCardStat}>DISTANCE\n{formatDistance(activity.distanceM)}</Text><Text style={styles.shareCardStat}>PACE\n{formatPaceSecondsPerKm(pace)}</Text><Text style={styles.shareCardStat}>TIME\n{formatMilliseconds(activity.elapsedMs)}</Text></View></ViewShot>
    <Text style={[styles.section, light && lightStyles.title]}>PACE</Text><View style={[styles.chart, light && lightStyles.panel]}><DataBars values={paceSeries} color={light ? '#4CCBB8' : '#35C8FF'} invert /><Text style={[styles.chartCaption, light && lightStyles.meta]}>{paceSeries.length ? `จาก GPS ${paceSeries.length} จุด · เฉลี่ย ${formatPaceSecondsPerKm(pace)}` : 'ไม่มีข้อมูล pace จาก GPS'}</Text></View>
    <Text style={[styles.section, light && lightStyles.title]}>SPLITS</Text><View style={[styles.laps, light && lightStyles.panel]}>{laps.length === 0 ? <Text style={[styles.chartCaption, light && lightStyles.meta]}>ยังไม่มีข้อมูลรอบวิ่ง</Text> : laps.map((lap) => <View key={lap.lapIndex} style={[styles.lapRow, light && lightStyles.divider]}><Text style={[styles.lapLabel, light && lightStyles.title]}>KM {lap.lapIndex}</Text><Text style={[styles.lapValue, light && lightStyles.title]}>{formatMilliseconds(lap.durationMs)}</Text><Text style={[styles.lapValue, light && lightStyles.meta]}>{formatPaceSecondsPerKm(lap.averagePaceSecondsPerKm)}</Text></View>)}</View>
    <Text style={[styles.section, light && lightStyles.title]}>ELEVATION</Text><View style={[styles.chart, light && lightStyles.panel]}><DataBars values={elevationSeries} color={light ? '#7EA6F2' : '#5E8FE8'} /><Text style={[styles.chartCaption, light && lightStyles.meta]}>{elevationSeries.length ? `ข้อมูลจริง ${elevationSeries.length} จุด · gain ${Math.round(elevationGain(points))} m` : 'ไม่มีข้อมูล elevation'}</Text></View>
    <Modal transparent visible={actionsOpen} animationType="fade" onRequestClose={() => setActionsOpen(false)}>
      <View style={actionStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionsOpen(false)} />
        <View style={actionStyles.menu}>
          <Text style={actionStyles.title}>การตั้งค่ากิจกรรม</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="ลบกิจกรรม" style={actionStyles.deleteAction} onPress={() => { setActionsOpen(false); setTimeout(deleteActivity, 150); }}>
            <Text style={actionStyles.deleteActionText}>ลบกิจกรรม</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </RunScreen>;
}

function Stat({ label, value, light }: { label: string; value: string; light: boolean }) { return <View style={[styles.stat, light && lightStyles.divider]}><Text style={[styles.statLabel, light && lightStyles.meta]}>{label}</Text><Text style={[styles.statValue, light && lightStyles.title]}>{value}</Text></View>; }
function DataBars({ values, color, invert = false }: { values: number[]; color: string; invert?: boolean }) {
  if (!values.length) return <View style={styles.noChart} />;
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(0.001, max - min);
  const sampled = values.length > 36 ? values.filter((_, index) => index % Math.ceil(values.length / 36) === 0) : values;
  return <View style={styles.bars}>{sampled.map((value, index) => { const normalized = (value - min) / range; const height = 12 + normalized * 92; return <View key={index} style={[styles.bar, { height, backgroundColor: color, opacity: invert ? 1 - normalized * .35 : .55 + normalized * .45 }]} />; })}</View>;
}

const styles = StyleSheet.create({ date: { color: '#8FA5BC', fontSize: 14, fontWeight: '700' }, routeCard: { height: 170, backgroundColor: '#101923', borderTopColor: '#35C8FF', borderTopWidth: 3, borderRadius: 4, overflow: 'hidden' }, routeLine: { position: 'absolute', height: 4, backgroundColor: '#35C8FF', borderRadius: 2 }, routePoint: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#C6FF29' }, routeGlyph: { flex: 1, alignItems: 'center', justifyContent: 'center' }, routeGlyphText: { color: '#35C8FF', fontSize: 66, fontWeight: '700', transform: [{ rotate: '-15deg' }] }, routeEmpty: { color: '#8FA5BC', fontWeight: '800' }, activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, activityType: { color: '#35C8FF', fontSize: 16, fontWeight: '700' }, activityDistance: { color: '#F7FBFF', fontSize: 20, fontWeight: '700' }, grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#101923', borderRadius: 4 }, stat: { width: '33.333%', minHeight: 94, padding: 14, borderBottomColor: '#233445', borderBottomWidth: 1 }, statLabel: { color: '#8FA5BC', fontSize: 10, fontWeight: '700', letterSpacing: .6 }, statValue: { color: '#F7FBFF', fontSize: 19, fontWeight: '700', marginTop: 8 }, share: { minHeight: 56, backgroundColor: '#C6FF29', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, shareText: { color: '#07101A', fontSize: 18, fontWeight: '700' }, imageShare: { minHeight: 52, backgroundColor: '#DCE8F2', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, imageShareText: { color: '#182232', fontSize: 16, fontWeight: '700' }, shareCard: { width: '100%', minHeight: 180, backgroundColor: 'transparent', padding: 20, gap: 10 }, shareCardTitle: { color: '#182232', fontSize: 18, fontWeight: '700', letterSpacing: 1 }, shareCardRoute: { color: '#677486', fontSize: 14, fontWeight: '700' }, shareCardStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 }, shareCardStat: { color: '#182232', fontSize: 16, fontWeight: '800', lineHeight: 26 }, section: { color: '#F7FBFF', fontSize: 22, fontWeight: '700', marginTop: 6 }, chart: { height: 164, backgroundColor: '#101923', borderRadius: 4, borderTopColor: '#35C8FF', borderTopWidth: 3, padding: 16, justifyContent: 'flex-end', overflow: 'hidden' }, bars: { height: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }, bar: { flex: 1, minWidth: 2, borderRadius: 1 }, noChart: { height: 112 }, laps: { backgroundColor: '#101923', borderRadius: 4, padding: 12 }, lapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomColor: '#233445', borderBottomWidth: 1 }, lapLabel: { flex: 1, color: '#F7FBFF', fontWeight: '700' }, lapValue: { width: 90, textAlign: 'right', color: '#F7FBFF', fontWeight: '800' }, chartCaption: { color: '#B7C9D9', fontSize: 14, fontWeight: '800', marginTop: 15 } });
const lightStyles = StyleSheet.create({ meta: { color: '#677486' }, title: { color: '#182232' }, routeCard: { backgroundColor: '#FFF9F7', borderTopColor: '#F38A7B', borderRadius: 20 }, routeLine: { backgroundColor: '#F38A7B' }, routePoint: { backgroundColor: '#F38A7B' }, routeGlyphText: { color: '#F38A7B' }, activityType: { color: '#4B5869' }, panel: { backgroundColor: '#FFFFFF', borderRadius: 20, shadowColor: '#28354A', shadowOpacity: .07, shadowRadius: 12, elevation: 2 }, divider: { borderBottomColor: '#E7EBF0' }, share: { backgroundColor: '#1D2530', borderRadius: 20 }, shareText: { color: '#FFFFFF' }, imageShare: { backgroundColor: '#E7EEF4' }, imageShareText: { color: '#182232' }, chartLine: { borderTopColor: '#4CCBB8', borderRightColor: '#4CCBB8' }, elevationFill: { backgroundColor: '#7EA6F2' } });
const actionStyles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moreButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E9EE' },
  moreButtonText: { color: '#303945', fontSize: 24, fontWeight: '700', lineHeight: 28 },
  backdrop: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-start', backgroundColor: 'rgba(15,25,35,.28)', paddingTop: 72, paddingHorizontal: 20 },
  menu: { width: 220, padding: 8, gap: 6, borderRadius: 16, backgroundColor: '#FFFFFF', shadowColor: '#172434', shadowOpacity: .16, shadowRadius: 16, elevation: 8 },
  title: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, color: '#667282', fontSize: 13, fontWeight: '700' },
  deleteAction: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  deleteActionText: { color: '#C0394B', fontSize: 15, fontWeight: '700' },
});
