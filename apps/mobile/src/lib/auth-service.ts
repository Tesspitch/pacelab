import { supabase } from '@/lib/supabase';

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: false, queryParams: { prompt: 'select_account' } } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
