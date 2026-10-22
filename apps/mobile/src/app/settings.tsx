import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BodyText, Eyebrow, RunScreen, ScreenTitle } from '@/components/run-ui';
import { deleteCurrentAccount } from '@/lib/account-service';
import { signOut } from '@/lib/auth-service';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';

export default function SettingsScreen() {
  const performLogout = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง';
      if (Platform.OS === 'web') window.alert(`ออกจากระบบไม่สำเร็จ: ${message}`);
      else Alert.alert('ออกจากระบบไม่สำเร็จ', message);
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
  const deleteAccount = () => Alert.alert(
    'ลบบัญชีถาวร?',
    'ข้อมูลกิจกรรม, GPS, สถิติ และ preset ทั้งบน Cloud และในเครื่องจะถูกลบถาวร และไม่สามารถกู้คืนได้',
    [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบบัญชีถาวร',
        style: 'destructive',
        onPress: () => Alert.alert(
          'ยืนยันครั้งสุดท้าย',
          'ต้องการลบบัญชีและข้อมูลทั้งหมดจริงหรือไม่?',
          [{ text: 'ยกเลิก', style: 'cancel' }, {
            text: 'ยืนยันการลบ', style: 'destructive', onPress: () => {
              void deleteCurrentAccount()
                .then(() => router.replace('/login'))
                .catch(() => Alert.alert('ลบบัญชีไม่สำเร็จ', 'ไม่สามารถลบบัญชีได้ในขณะนี้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'));
            },
          }],
        ),
      },
    ],
  );
  return (
    <RunScreen>
      <Eyebrow>PaceLab</Eyebrow>
      <ScreenTitle>การตั้งค่า</ScreenTitle>
      <BodyText>จัดการข้อมูลแอปและสิทธิ์การใช้งานได้จากหน้านี้</BodyText>
      <View style={styles.card}>
        <Text style={styles.title}>การแสดงผล</Text>
        <Text style={styles.caption}>ใช้รูปแบบเดียวกันทุกหน้า เพื่อให้ข้อมูลการวิ่งอ่านง่ายและต่อเนื่อง</Text>
        <View style={styles.palette}>
          <View style={[styles.swatch, { backgroundColor: '#F1F4F8' }]} />
          <View style={[styles.swatch, { backgroundColor: '#FFFFFF' }]} />
          <View style={[styles.swatch, { backgroundColor: '#43C7B5' }]} />
          <View style={[styles.swatch, { backgroundColor: '#191D23' }]} />
        </View>
      </View>
      {supabase && <Pressable style={styles.logout} onPress={logout}><Text style={styles.logoutText}>ออกจากระบบ</Text></Pressable>}
      <View style={styles.card}>
        <Text style={styles.title}>ข้อมูลและความเป็นส่วนตัว</Text>
        <Text style={styles.caption}>กิจกรรมและข้อมูล GPS ถูกบันทึกในเครื่องและซิงก์กับบัญชีของคุณ</Text>
        {supabase && <Pressable style={styles.deleteAccount} onPress={deleteAccount}><Text style={styles.deleteAccountText}>ลบบัญชีและข้อมูลทั้งหมด</Text></Pressable>}
      </View>
    </RunScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, backgroundColor: '#FFFFFF', borderColor: '#E5E9EE', borderWidth: 1, borderRadius: 20, padding: 18, shadowColor: '#263547', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  title: { color: '#191D23', fontSize: 18, fontWeight: '700' },
  caption: { color: '#667282', lineHeight: 22 },
  palette: { flexDirection: 'row', gap: 10, marginTop: 4 },
  swatch: { width: 32, height: 32, borderRadius: 20, borderColor: '#E1E6EB', borderWidth: 1 },
  logout: { borderRadius: 16, minHeight: 54, backgroundColor: '#FFF0F1', padding: 17, alignItems: 'center' },
  logoutText: { color: '#C0394B', fontWeight: '700' },
  deleteAccount: { borderRadius: 16, minHeight: 54, borderColor: '#C0394B', borderWidth: 1, marginTop: 4, padding: 15, alignItems: 'center' },
  deleteAccountText: { color: '#C0394B', fontWeight: '700' },
});
