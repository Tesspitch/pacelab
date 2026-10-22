import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { signInWithGoogle } from '@/lib/auth-service';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const handleGoogle = async () => {
    setLoading(true); setError(null); setStatus('กำลังเปิดหน้าล็อกอิน Google…');
    try { setStatus('กำลังรอยืนยันบัญชี Google…'); await signInWithGoogle(); setStatus('เข้าสู่ระบบสำเร็จ กำลังโหลด PaceLab…'); }
    catch (e) { setStatus(null); setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ'); }
    finally { setLoading(false); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: '#F4F7FA' }} contentContainerStyle={styles.screen}>
    <View accessible={false} style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#DDF4EE', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Text style={{ fontSize: 38, color: '#168B80' }}>↗</Text></View><Text style={styles.eyebrow}>PACELAB · RUN BETTER</Text>
    <Text style={styles.title}>พร้อมออกวิ่งไหม?</Text>
    <Text style={styles.subtitle}>เข้าสู่ระบบเพื่อสำรองข้อมูลและซิงก์ประวัติการวิ่ง</Text>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>เข้าสู่ระบบ</Text>
      <Text style={styles.cardText}>เก็บทุกกิจกรรมไว้ด้วยกัน พร้อมกลับมาดูความก้าวหน้าของคุณ</Text>
      <Pressable style={styles.google} onPress={() => void handleGoogle()} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleText}>เข้าสู่ระบบด้วย Google</Text>}
      </Pressable>
      {status && <Text style={styles.status}>{status}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
    <Pressable accessibilityRole="button" onPress={goBack}><Text style={styles.back}>กลับไปก่อน</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flexGrow: 1, backgroundColor: '#F4F7FA', padding: 24, paddingTop: 64, paddingBottom: 40, gap: 18, justifyContent: 'center' }, eyebrow: { color: '#159E9A', fontWeight: '700', letterSpacing: 1.5 }, title: { color: '#172434', fontSize: 34, fontWeight: '700' }, subtitle: { color: '#607184', fontSize: 16, lineHeight: 24 }, card: { borderRadius: 26, backgroundColor: '#FFFFFF', borderLeftWidth: 0, borderLeftColor: '#43C7B5', padding: 20, gap: 14, marginTop: 12, shadowColor: '#172434', shadowOpacity: .08, shadowRadius: 14, elevation: 2 }, cardTitle: { color: '#172434', fontSize: 22, fontWeight: '700' }, cardText: { color: '#607184', lineHeight: 22 }, google: { borderRadius: 16, minHeight: 56, backgroundColor: '#172434', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, googleText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }, status: { color: '#159E9A', lineHeight: 20, fontWeight: '800' }, error: { color: '#C0394B', lineHeight: 20 }, back: { padding: 14, color: '#159E9A', fontWeight: '800', textAlign: 'center', marginTop: 8 } });
