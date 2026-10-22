import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const { code, error_description: errorDescription, error: authError } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
    error?: string;
  }>();
  const [error, setError] = useState<string | null>(
    errorDescription || authError || (!supabase ? 'ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้' : null),
  );

  useEffect(() => {
    if (!supabase || authError || errorDescription) return;
    const client = supabase;

    let active = true;
    const finishSignIn = async () => {
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }

      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (data.session) {
        router.replace('/');
      } else if (active) {
        setError('ไม่พบเซสชันเข้าสู่ระบบ กรุณาลองอีกครั้ง');
      }
    };

    void finishSignIn().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ');
    });

    return () => {
      active = false;
    };
  }, [authError, code, errorDescription]);

  return (
    <View style={styles.screen}>
      {error ? (
        <>
          <Text style={styles.title}>เข้าสู่ระบบไม่สำเร็จ</Text>
          <Text style={styles.message}>{error}</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>กลับไปหน้าเข้าสู่ระบบ</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color="#159E9A" size="large" />
          <Text style={styles.title}>กำลังเข้าสู่ระบบ</Text>
          <Text style={styles.message}>กรุณารอสักครู่ ระบบกำลังเชื่อมต่อบัญชีของคุณ</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#F1F4F8',
    padding: 24,
  },
  title: {
    color: '#191D23',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: '#667282',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#43C7B5',
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#14202B',
    fontSize: 16,
    fontWeight: '700',
  },
});
