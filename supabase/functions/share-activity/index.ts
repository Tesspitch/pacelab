import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'method not allowed' }, 405);
  const url = new URL(request.url);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  if (request.method === 'GET') {
    const token = url.searchParams.get('token');
    if (!token || token.length < 40 || token.length > 128) return json({ error: 'invalid token' }, 400);
    const { data: share } = await admin.from('activity_shares').select('id,expires_at,revoked_at').eq('token_hash', await hashToken(token)).maybeSingle();
    if (!share || share.revoked_at || (share.expires_at && new Date(share.expires_at) <= new Date())) return json({ error: 'share unavailable' }, 404);
    const { data: snapshot } = await admin.from('share_snapshots').select('snapshot').eq('share_id', share.id).single();
    return snapshot ? json(snapshot.snapshot) : json({ error: 'share unavailable' }, 404);
  }
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) return json({ error: 'request too large' }, 413);
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await request.json() as { sessionId?: string; expiresAt?: string | null };
  if (request.method === 'DELETE') {
    const revokeBody = body as { shareId?: string };
    if (!revokeBody.shareId) return json({ error: 'shareId is required' }, 400);
    const { error } = await admin.from('activity_shares').update({ revoked_at: new Date().toISOString() }).eq('id', revokeBody.shareId).eq('owner_id', user.id);
    return error ? json({ error: 'unable to revoke share' }, 500) : json({ revoked: true });
  }
  if (!body.sessionId) return json({ error: 'sessionId is required' }, 400);
  const { data: session, error: sessionError } = await admin.from('running_sessions').select('id,mode,started_at,ended_at,elapsed_ms,distance_m').eq('id', body.sessionId).eq('user_id', user.id).single();
  if (sessionError || !session) return json({ error: 'activity not found' }, 404);
  const token = randomToken();
  const { data: share, error: shareError } = await admin.from('activity_shares').insert({ owner_id: user.id, session_id: session.id, token_hash: await hashToken(token), expires_at: body.expiresAt ?? null }).select('id').single();
  if (shareError || !share) return json({ error: 'unable to create share' }, 500);
  const snapshot = { version: 1, activity: { mode: session.mode, startedAt: session.started_at, endedAt: session.ended_at, elapsedMs: session.elapsed_ms, distanceM: session.distance_m } };
  const { error: snapshotError } = await admin.from('share_snapshots').insert({ share_id: share.id, snapshot });
  if (snapshotError) {
    await admin.from('activity_shares').delete().eq('id', share.id).eq('owner_id', user.id);
    return json({ error: 'unable to create share' }, 500);
  }
  const viewerBase = Deno.env.get('PUBLIC_SHARE_BASE_URL')?.replace(/\/$/, '');
  return json({ token, shareId: share.id, url: viewerBase ? `${viewerBase}/?token=${encodeURIComponent(token)}` : `${supabaseUrl}/functions/v1/share-activity?token=${encodeURIComponent(token)}` });
});
