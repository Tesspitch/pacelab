import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, RunScreen } from '@/components/run-ui';
import { getPersonalRecords, getProfileStats, initializeDatabase, type PersonalRecord } from '@/lib/database';
import { syncAuthenticatedData } from '@/lib/sync-service';
import { signOut } from '@/lib/auth-service';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const [email, setEmail] = useState('โหมดออฟไลน์'); const [name, setName] = useState('นักวิ่ง PaceLab'); const [avatar, setAvatar] = useState<string | null>(null);
  const [stats, setStats] = useState({ sessions: 0, distanceM: 0, elapsedMs: 0, milestones: {} as Record<string, number> });
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { void initializeDatabase().then(async () => { await syncAuthenticatedData().catch(() => undefined); const [summary, personalRecords] = await Promise.all([getProfileStats(), getPersonalRecords()]); setStats(summary); setRecords(personalRecords); }); void supabase?.auth.getUser().then(({ data }) => { const u = data.user; setEmail(u?.email ?? 'โหมดออฟไลน์'); setName((u?.user_metadata?.full_name as string | undefined) ?? (u?.user_metadata?.name as string | undefined) ?? u?.email ?? 'นักวิ่ง PaceLab'); setAvatar((u?.user_metadata?.avatar_url as string | undefined) ?? (u?.user_metadata?.picture as string | undefined) ?? null); }); }, []);
  const performLogout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setEmail('โหมดออฟไลน์');
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง';
      if (Platform.OS === 'web') window.alert(`ออกจากระบบไม่สำเร็จ: ${message}`);
      else Alert.alert('ออกจากระบบไม่สำเร็จ', message);
    } finally {
      setSigningOut(false);
    }
  };
  const logout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('ต้องการออกจากระบบ PaceLab ใช่หรือไม่?')) void performLogout();
      return;
    }
    Alert.alert('ออกจากระบบ', 'ต้องการออกจากระบบ PaceLab ใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ออกจากระบบ', style: 'destructive', onPress: () => void performLogout() },
    ]);
  };
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const avatarSource = avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=43C7B5&color=172434&size=128&bold=true`;
  const personalBests = records.filter(
    (record): record is PersonalRecord & { durationMs: number } =>
      record.durationMs !== null && record.durationMs > 0,
  );
  return <RunScreen><View style={styles.screen}><Pressable accessibilityRole="button" accessibilityLabel="กลับ" style={styles.backButton} onPress={goBack}><Text style={styles.backArrow}>‹</Text></Pressable><Eyebrow>PACELAB · PROFILE</Eyebrow><View style={styles.identity}><View style={styles.avatar}><Image source={{ uri: avatarSource }} onError={() => setAvatar(null)} style={styles.avatarImage} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.name}>{name}</Text><Text style={styles.muted}>{email === 'โหมดออฟไลน์' ? 'บันทึกข้อมูลไว้ในเครื่อง' : email}</Text></View></View><Text style={styles.section}>สถิติรวม</Text><View style={styles.stats}><Stat label="กิจกรรม" value={String(stats.sessions)} /><Stat label="ระยะทาง" value={`${(stats.distanceM / 1000).toFixed(1)} km`} /><Stat label="เวลารวม" value={`${Math.floor(stats.elapsedMs / 3600000)} ชม.`} /></View>{personalBests.length > 0 && <><Text style={styles.section}>Personal Best</Text><View style={styles.milestones}>{personalBests.map((record) => <View key={record.label} style={[styles.milestone, styles.milestoneDone]}><Text style={styles.milestoneValue}>{formatPersonalBestTime(record.durationMs)}</Text><Text style={styles.muted}>{record.label}</Text></View>)}</View></>}<Pressable style={styles.settings} onPress={() => router.push('/settings')}><Text style={styles.settingsText}>การตั้งค่า</Text><Text style={styles.arrow}>›</Text></Pressable>{email !== 'โหมดออฟไลน์' && <Pressable disabled={signingOut} accessibilityRole="button" style={[styles.logout, signingOut && { opacity: 0.55 }]} onPress={logout}><Text style={styles.logoutText}>{signingOut ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</Text></Pressable>}</View></RunScreen>;
}
function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.value}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function formatPersonalBestTime(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${seconds}`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(totalMinutes % 60).padStart(2, '0')}:${seconds}`;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, backgroundColor: '#F4F7FA', padding: 20, paddingTop: 48, paddingBottom: 40, gap: 20, maxWidth: 640, width: '100%', alignSelf: 'center' }, backButton: { borderRadius: 16, width: 42, height: 42, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, backArrow: { color: '#172434', fontSize: 34, lineHeight: 36 }, eyebrow: { color: '#159E9A', fontWeight: '700', letterSpacing: 1.4 }, identity: { borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', padding: 18, borderLeftWidth: 0, borderLeftColor: '#43C7B5' }, avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: '#43C7B5', alignItems: 'center', justifyContent: 'center' }, avatarImage: { width: '100%', height: '100%' }, avatarText: { color: '#172434', fontWeight: '700', fontSize: 20 }, name: { color: '#172434', fontWeight: '700', fontSize: 17 }, muted: { color: '#607184', marginTop: 4 }, section: { color: '#172434', fontSize: 22, fontWeight: '700' }, stats: { flexDirection: 'row', gap: 10 }, stat: { borderRadius: 18, minWidth: 0, flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderTopWidth: 0, borderTopColor: '#35C8FF' }, value: { color: '#172434', fontSize: 22, fontWeight: '700' }, milestones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, milestone: { borderRadius: 16, width: '47%', flexGrow: 1, minHeight: 94, backgroundColor: '#FFFFFF', padding: 10, alignItems: 'center', borderTopWidth: 3, borderTopColor: '#D8E0E8' }, milestoneDone: { borderTopColor: '#43C7B5' }, milestoneValue: { color: '#172434', fontSize: 20, fontWeight: '700' }, settings: { borderRadius: 18, minHeight: 60, alignItems: 'center', backgroundColor: '#FFFFFF', padding: 18, flexDirection: 'row', justifyContent: 'space-between' }, settingsText: { color: '#172434', fontWeight: '800' }, arrow: { color: '#159E9A', fontSize: 24 }, logout: { borderRadius: 16, backgroundColor: '#FFF0F1', padding: 17, alignItems: 'center' }, logoutText: { color: '#C0394B', fontWeight: '700' } });
