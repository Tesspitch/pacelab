import { clearAllLocalData } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export async function deleteCurrentAccount(): Promise<void> {
  if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบอีกครั้งก่อนลบบัญชี');

  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation: 'DELETE' },
  });
  if (error) throw error;

  await clearAllLocalData();
  await supabase.auth.signOut({ scope: 'local' });
}
