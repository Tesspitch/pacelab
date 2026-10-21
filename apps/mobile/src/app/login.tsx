import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { signInWithGoogle } from '@/lib/auth-service';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ'); } finally { setLoading(false); }
  };
  return <View style={styles.screen}>
    <Text style={styles.eyebrow}>PACELAB · RUN BETTER</Text>
    <Text style={styles.title}>พร้อมออกวิ่งไหม?</Text>
    <Text style={styles.subtitle}>เข้าสู่ระบบเพื่อสำรองข้อมูลและซิงก์ประวัติการวิ่ง</Text>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>เข้าสู่ระบบ</Text>
      <Text style={styles.cardText}>ข้อมูลการวิ่งยังบันทึกออฟไลน์ได้ แม้ยังไม่เข้าสู่ระบบ</Text>
      <Pressable style={styles.google} onPress={() => void handleGoogle()} disabled={loading}>
        {loading ? <ActivityIndicator color="#101923" /> : <Text style={styles.googleText}>เข้าสู่ระบบด้วย Google</Text>}
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>กลับไปก่อน</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F4F7FA', padding: 24, gap: 16, justifyContent: 'center' }, eyebrow: { color: '#159E9A', fontWeight: '900', letterSpacing: 1.5 }, title: { color: '#172434', fontSize: 36, fontWeight: '900' }, subtitle: { color: '#607184', fontSize: 16, lineHeight: 24 }, card: { backgroundColor: '#FFFFFF', borderLeftWidth: 4, borderLeftColor: '#43C7B5', padding: 20, gap: 14, marginTop: 12, shadowColor: '#172434', shadowOpacity: .08, shadowRadius: 14, elevation: 2 }, cardTitle: { color: '#172434', fontSize: 22, fontWeight: '900' }, cardText: { color: '#607184', lineHeight: 22 }, google: { minHeight: 52, backgroundColor: '#172434', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, googleText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 }, error: { color: '#C0394B', lineHeight: 20 }, back: { color: '#159E9A', fontWeight: '800', textAlign: 'center', marginTop: 8 } });
