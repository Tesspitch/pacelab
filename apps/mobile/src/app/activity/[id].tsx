import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { useAppTheme } from '@/components/app-theme';
import { getActivityDetail, getActivityGpsPoints, type ActivityDetail, type ActivityGpsPoint } from '@/lib/database';
import { formatDistance, formatMilliseconds, formatPaceSecondsPerKm } from '@/lib/format';

function elevationGain(points: ActivityGpsPoint[]) {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1];
    return previous?.altitudeM !== null && point.altitudeM !== null && point.altitudeM > previous.altitudeM ? total + point.altitudeM - previous.altitudeM : total;
  }, 0);
}

export default function ActivityDetailScreen() {
  const { mode } = useAppTheme();
  const light = mode === 'light';
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [points, setPoints] = useState<ActivityGpsPoint[]>([]);
  const shareCardRef = useRef<any>(null);
  useEffect(() => { if (id) void Promise.all([getActivityDetail(id), getActivityGpsPoints(id)]).then(([detail, gps]) => { setActivity(detail); setPoints(gps); }); }, [id]);
  const pace = activity && activity.distanceM > 0 ? activity.elapsedMs / 1000 / (activity.distanceM / 1000) : null;
  const route = useMemo(() => points.length > 1 ? points.map((point) => ({ x: point.longitude, y: point.latitude })) : [], [points]);
  const shareActivity = async () => {
    if (!activity) return;
    const distance = formatDistance(activity.distanceM);
    const duration = formatMilliseconds(activity.elapsedMs);
    const paceText = formatPaceSecondsPerKm(pace);
    try {
      const message = `ผลการวิ่ง PaceLab\nระยะทาง ${distance}\nเวลา ${duration}\nเพซเฉลี่ย ${paceText}`;
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
  const minX = route.length ? Math.min(...route.map((point) => point.x)) : 0;
  const maxX = route.length ? Math.max(...route.map((point) => point.x)) : 1;
  const minY = route.length ? Math.min(...route.map((point) => point.y)) : 0;
  const maxY = route.length ? Math.max(...route.map((point) => point.y)) : 1;
  if (!activity) return <RunScreen><Eyebrow>Activity</Eyebrow><ScreenTitle>ไม่พบกิจกรรม</ScreenTitle></RunScreen>;
  const date = new Date(activity.startedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  return <RunScreen><Eyebrow>{activity.mode === 'free_run' ? 'RUN' : 'INTERVAL'}</Eyebrow><ScreenTitle>{activity.mode === 'free_run' ? 'Run' : 'Interval'}</ScreenTitle><Text style={[styles.date, light && lightStyles.meta]}>{date}</Text>
    <View style={[styles.routeCard, light && lightStyles.routeCard]}>{route.length > 1 ? route.map((point, index) => <View key={index} style={[styles.routePoint, light && lightStyles.routePoint, { left: 12 + ((point.x - minX) / Math.max(0.000001, maxX - minX)) * 250, top: 12 + (1 - (point.y - minY) / Math.max(0.000001, maxY - minY)) * 130 }]} />) : <View style={styles.routeGlyph}><Text style={[styles.routeGlyphText, light && lightStyles.routeGlyphText]}>⌁</Text><Text style={[styles.routeEmpty, light && lightStyles.meta]}>ไม่มีเส้นทาง GPS</Text></View>}</View>
    <View style={styles.activityHeader}><Text style={[styles.activityType, light && lightStyles.activityType]}>{activity.mode === 'free_run' ? 'Free Run' : 'Interval'}</Text><Text style={[styles.activityDistance, light && lightStyles.title]}>{formatDistance(activity.distanceM)}</Text></View>
    <View style={[styles.grid, light && lightStyles.panel]}><Stat label="DISTANCE" value={formatDistance(activity.distanceM)} light={light} /><Stat label="TIME" value={formatMilliseconds(activity.elapsedMs)} light={light} /><Stat label="AVG PACE" value={formatPaceSecondsPerKm(pace)} light={light} /><Stat label="ELEVATION" value={points.length ? `${Math.round(elevationGain(points))} m` : '—'} light={light} /><Stat label="CADENCE" value="—" light={light} /><Stat label="AVG HR" value="—" light={light} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="แชร์กิจกรรม" onPress={() => void shareActivity()} style={[styles.share, light && lightStyles.share]}><Text style={[styles.shareText, light && lightStyles.shareText]}>↥  Share</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="แชร์เป็นรูปภาพ" onPress={() => void shareActivityImage()} style={[styles.imageShare, light && lightStyles.imageShare]}><Text style={[styles.imageShareText, light && lightStyles.imageShareText]}>▧  แชร์เป็น PNG โปร่งใส</Text></Pressable>
    <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={styles.shareCard}><Text style={styles.shareCardTitle}>PACELAB · RUN</Text><Text style={styles.shareCardRoute}>{route.length > 1 ? '●  GPS route recorded' : '○  GPS route unavailable'}</Text><View style={styles.shareCardStats}><Text style={styles.shareCardStat}>DISTANCE\n{formatDistance(activity.distanceM)}</Text><Text style={styles.shareCardStat}>PACE\n{formatPaceSecondsPerKm(pace)}</Text><Text style={styles.shareCardStat}>TIME\n{formatMilliseconds(activity.elapsedMs)}</Text></View></ViewShot>
    <Text style={[styles.section, light && lightStyles.title]}>PACE</Text><View style={[styles.chart, light && lightStyles.panel]}><View style={[styles.chartLine, light && lightStyles.chartLine]} /><Text style={[styles.chartCaption, light && lightStyles.meta]}>Average pace  {formatPaceSecondsPerKm(pace)}</Text></View>
    <Text style={[styles.section, light && lightStyles.title]}>ELEVATION</Text><View style={[styles.chart, light && lightStyles.panel]}><View style={[styles.elevationFill, light && lightStyles.elevationFill]} /><Text style={[styles.chartCaption, light && lightStyles.meta]}>{points.length ? `Elevation gain  ${Math.round(elevationGain(points))} m` : 'ไม่มีข้อมูล elevation'}</Text></View>
  </RunScreen>;
}

function Stat({ label, value, light }: { label: string; value: string; light: boolean }) { return <View style={[styles.stat, light && lightStyles.divider]}><Text style={[styles.statLabel, light && lightStyles.meta]}>{label}</Text><Text style={[styles.statValue, light && lightStyles.title]}>{value}</Text></View>; }

const styles = StyleSheet.create({ date: { color: '#8FA5BC', fontSize: 14, fontWeight: '700' }, routeCard: { height: 170, backgroundColor: '#101923', borderTopColor: '#35C8FF', borderTopWidth: 3, borderRadius: 4, overflow: 'hidden' }, routePoint: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#C6FF29' }, routeGlyph: { flex: 1, alignItems: 'center', justifyContent: 'center' }, routeGlyphText: { color: '#35C8FF', fontSize: 66, fontWeight: '900', transform: [{ rotate: '-15deg' }] }, routeEmpty: { color: '#8FA5BC', fontWeight: '800' }, activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, activityType: { color: '#35C8FF', fontSize: 16, fontWeight: '900' }, activityDistance: { color: '#F7FBFF', fontSize: 20, fontWeight: '900' }, grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#101923', borderRadius: 4 }, stat: { width: '33.333%', minHeight: 94, padding: 14, borderBottomColor: '#233445', borderBottomWidth: 1 }, statLabel: { color: '#8FA5BC', fontSize: 10, fontWeight: '900', letterSpacing: .6 }, statValue: { color: '#F7FBFF', fontSize: 19, fontWeight: '900', marginTop: 8 }, share: { minHeight: 56, backgroundColor: '#C6FF29', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, shareText: { color: '#07101A', fontSize: 18, fontWeight: '900' }, imageShare: { minHeight: 52, backgroundColor: '#DCE8F2', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, imageShareText: { color: '#182232', fontSize: 16, fontWeight: '900' }, shareCard: { width: '100%', minHeight: 180, backgroundColor: 'transparent', padding: 20, gap: 10 }, shareCardTitle: { color: '#182232', fontSize: 18, fontWeight: '900', letterSpacing: 1 }, shareCardRoute: { color: '#677486', fontSize: 14, fontWeight: '700' }, shareCardStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 }, shareCardStat: { color: '#182232', fontSize: 16, fontWeight: '800', lineHeight: 26 }, section: { color: '#F7FBFF', fontSize: 22, fontWeight: '900', marginTop: 6 }, chart: { height: 164, backgroundColor: '#101923', borderRadius: 4, borderTopColor: '#35C8FF', borderTopWidth: 3, padding: 16, justifyContent: 'flex-end', overflow: 'hidden' }, chartLine: { height: 48, borderTopColor: '#35C8FF', borderTopWidth: 3, borderRightColor: '#35C8FF', borderRightWidth: 3, transform: [{ skewX: '-25deg' }], opacity: .8 }, elevationFill: { height: 62, width: '70%', alignSelf: 'center', backgroundColor: '#284A86', transform: [{ skewX: '-18deg' }] }, chartCaption: { color: '#B7C9D9', fontSize: 14, fontWeight: '800', marginTop: 15 } });
const lightStyles = StyleSheet.create({ meta: { color: '#677486' }, title: { color: '#182232' }, routeCard: { backgroundColor: '#FFF9F7', borderTopColor: '#F38A7B', borderRadius: 0 }, routePoint: { backgroundColor: '#F38A7B' }, routeGlyphText: { color: '#F38A7B' }, activityType: { color: '#4B5869' }, panel: { backgroundColor: '#FFFFFF', borderRadius: 0, shadowColor: '#28354A', shadowOpacity: .07, shadowRadius: 12, elevation: 2 }, divider: { borderBottomColor: '#E7EBF0' }, share: { backgroundColor: '#1D2530', borderRadius: 0 }, shareText: { color: '#FFFFFF' }, imageShare: { backgroundColor: '#E7EEF4' }, imageShareText: { color: '#182232' }, chartLine: { borderTopColor: '#4CCBB8', borderRightColor: '#4CCBB8' }, elevationFill: { backgroundColor: '#7EA6F2' } });
