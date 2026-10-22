import { supabase } from '@/lib/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const redirectTo = Linking.createURL('auth/callback');
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: false, redirectTo, queryParams: { prompt: 'select_account' } } });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { skipBrowserRedirect: true, redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data.url) throw new Error('ไม่สามารถเปิดหน้าล็อกอิน Google ได้');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    if (result.type === 'cancel' || result.type === 'dismiss') throw new Error('ยกเลิกการเข้าสู่ระบบ');
    throw new Error('การเข้าสู่ระบบ Google ไม่สำเร็จ');
  }

  const callback = new URL(result.url);
  const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
  const query = callback.searchParams;
  const code = query.get('code') ?? hash.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }
  const accessToken = hash.get('access_token') ?? query.get('access_token');
  const refreshToken = hash.get('refresh_token') ?? query.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('ไม่พบ token จาก Google');
  const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) throw sessionError;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
