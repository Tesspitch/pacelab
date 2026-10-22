import { getPendingSyncItems, markSyncItemAttempt, mergeRemoteRunningSessions, removeSyncItem, type RemoteRunningSession, type SyncQueueItem } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export interface SyncTransport {
  upsertRunningSession(payload: Record<string, unknown>): Promise<void>;
  upsertGpsPoint(payload: Record<string, unknown>): Promise<void>;
  upsertSessionLap(payload: Record<string, unknown>): Promise<void>;
  upsertPersonalBest(payload: Record<string, unknown>): Promise<void>;
  deleteRunningSession(id: string): Promise<void>;
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
  const result = await drainSyncQueue({
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
    async upsertGpsPoint(payload) { const { data: userData } = await client.auth.getUser(); if (!userData.user) throw new Error('Not authenticated'); const { error } = await client.from('gps_points').upsert({ ...payload, user_id: userData.user.id }); if (error) throw error; },
    async upsertSessionLap(payload) { const { data: userData } = await client.auth.getUser(); if (!userData.user) throw new Error('Not authenticated'); const { error } = await client.from('session_laps').upsert({ ...payload, user_id: userData.user.id }); if (error) throw error; },
    async upsertPersonalBest(payload) { const { data: userData } = await client.auth.getUser(); if (!userData.user) throw new Error('Not authenticated'); const { error } = await client.from('personal_bests').upsert({ ...payload, user_id: userData.user.id }, { onConflict: 'user_id,distance_m' }); if (error) throw error; },
    async deleteRunningSession(id) {
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      const { error: personalBestError } = await client.from('personal_bests').delete().eq('session_id', id).eq('user_id', userData.user.id);
      if (personalBestError) throw personalBestError;
      const { error } = await client.from('running_sessions').delete().eq('id', id).eq('user_id', userData.user.id);
      if (error) throw error;
    },
  });
  const { data: remoteSessions, error: pullError } = await client
    .from('running_sessions')
    .select('id,mode,started_at,ended_at,elapsed_ms,distance_m,created_at,updated_at')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });
  if (pullError) return { synced: result.synced, failed: result.failed + 1 };
  await mergeRemoteRunningSessions((remoteSessions ?? []) as RemoteRunningSession[]);
  return result;
}

async function dispatchSyncItem(transport: SyncTransport, item: SyncQueueItem): Promise<void> {
  const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;
  if (item.operation === 'delete') {
    if (item.entityType !== 'running_session' || typeof payload.id !== 'string') throw new Error('Unsupported sync deletion');
    return transport.deleteRunningSession(payload.id);
  }
  if (item.entityType === 'running_session') return transport.upsertRunningSession(payload);
  if (item.entityType === 'gps_point') return transport.upsertGpsPoint(payload);
  if (item.entityType === 'session_lap') return transport.upsertSessionLap(payload);
  if (item.entityType === 'personal_best') return transport.upsertPersonalBest(payload);
  throw new Error('Unsupported sync item');
}
