import { getPendingSyncItems, markSyncItemAttempt, removeSyncItem, type SyncQueueItem } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export interface SyncTransport {
  upsertRunningSession(payload: Record<string, unknown>): Promise<void>;
}

/**
 * Drains only completed local records. Active running sessions never call this
 * service, so the running loop remains offline-first and network-independent.
 */
export async function drainSyncQueue(transport: SyncTransport, limit = 20): Promise<{ synced: number; failed: number }> {
  const items = await getPendingSyncItems(limit);
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await dispatchSyncItem(transport, item);
      await removeSyncItem(item.id);
      synced += 1;
    } catch (error) {
      await markSyncItemAttempt(item.id, error instanceof Error ? error.message : 'sync failed');
      failed += 1;
    }
  }
  return { synced, failed };
}

export async function syncAuthenticatedData(): Promise<{ synced: number; failed: number }> {
  if (!supabase) return { synced: 0, failed: 0 };
  const client = supabase;
  const { data } = await client.auth.getSession();
  if (!data.session) return { synced: 0, failed: 0 };
  return drainSyncQueue({
    async upsertRunningSession(payload) {
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      const { error } = await client.from('running_sessions').upsert({
        id: payload.id,
        user_id: userData.user.id,
        mode: payload.mode,
        started_at: payload.started_at,
        ended_at: payload.ended_at,
        elapsed_ms: payload.elapsed_ms,
        distance_m: payload.distance_m,
      });
      if (error) throw error;
    },
  });
}

async function dispatchSyncItem(transport: SyncTransport, item: SyncQueueItem): Promise<void> {
  if (item.entityType !== 'running_session' || item.operation !== 'upsert') throw new Error('Unsupported sync item');
  await transport.upsertRunningSession(JSON.parse(item.payloadJson) as Record<string, unknown>);
}
