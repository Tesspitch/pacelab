import { supabase } from '@/lib/supabase';

export async function createActivityShare(sessionId: string) {
  if (!supabase) throw new Error('Cloud sync is not configured');
  const { data, error } = await supabase.functions.invoke('share-activity', { body: { sessionId } });
  if (error) throw error;
  if (!data?.url) throw new Error('Share link was not returned');
  return data as { url: string; token: string; shareId: string };
}

export async function revokeActivityShare(shareId: string) {
  if (!supabase) throw new Error('Cloud sync is not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in required');
  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/share-activity`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ shareId }) });
  if (!response.ok) throw new Error('Unable to revoke share');
}
