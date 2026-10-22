import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import {
  addGpsSample,
  assertValidWorkout,
  createGpsTrackerState,
  type GpsSample,
  type GpsSampleResult,
  type GpsTrackerState,
  type WorkoutDefinition,
} from '@pacelab/domain';
import { supabase } from '@/lib/supabase';

export type SessionMode = 'free_run' | 'speedwork';
export type RunType = 'easy' | 'recovery' | 'long' | 'general';

export interface InProgressSession {
  id: string;
  mode: SessionMode;
  status: 'in_progress' | 'paused';
  startedAt: string;
  elapsedMs: number;
  distanceM: number;
  workoutSnapshotJson: string | null;
}

export interface RecentSession {
  id: string;
  mode: SessionMode;
  startedAt: string;
  elapsedMs: number;
  distanceM: number;
}

export interface ActivityDetail extends RecentSession {
  endedAt: string | null;
}

export interface ActivityLap {
  lapIndex: number;
  distanceM: number;
  durationMs: number;
  averagePaceSecondsPerKm: number;
  validatedQuality: string;
}

export interface ActivityGpsPoint {
  id?: string;
  latitude: number;
  longitude: number;
  altitudeM: number | null;
  timestampMs: number;
  cumulativeDistanceM: number;
}

export interface SyncQueueItem {
  id: string;
  entityType: 'running_session' | 'gps_point' | 'session_lap' | 'personal_best';
  entityId: string;
  operation: 'upsert' | 'delete';
  payloadJson: string;
  attempts: number;
  nextAttemptAt: string;
}

export interface RemoteRunningSession {
  id: string;
  mode: SessionMode;
  started_at: string;
  ended_at: string | null;
  elapsed_ms: number;
  distance_m: number;
  created_at?: string;
  updated_at?: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureColumn(db: SQLite.SQLiteDatabase, table: string, column: string, definition: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('pace_lab.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_meta(key, value) VALUES('schema_version', '3');
    UPDATE schema_meta SET value = '3' WHERE key = 'schema_version';
    CREATE TABLE IF NOT EXISTS running_sessions (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK(mode IN ('free_run', 'speedwork')),
      run_type TEXT CHECK(run_type IN ('easy', 'recovery', 'long', 'general')),
      status TEXT NOT NULL CHECK(status IN ('in_progress', 'paused', 'completed', 'discarded')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
      distance_m REAL NOT NULL DEFAULT 0 CHECK(distance_m >= 0),
      workout_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK(mode <> 'free_run' OR run_type IS NOT NULL),
      CHECK(mode <> 'speedwork' OR workout_snapshot_json IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS sessions_started_at ON running_sessions(started_at DESC);
    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
      event_seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(session_id, event_seq)
    );
    CREATE TABLE IF NOT EXISTS gps_points (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
      timestamp_ms REAL NOT NULL,
      monotonic_ms REAL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      horizontal_accuracy_m REAL NOT NULL,
      altitude_m REAL,
      vertical_accuracy_m REAL,
      cumulative_distance_m REAL NOT NULL,
      quality TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('foreground', 'background')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gps_points_session_time
      ON gps_points(session_id, timestamp_ms);
    CREATE TABLE IF NOT EXISTS session_auto_laps (
      session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
      lap_index INTEGER NOT NULL,
      start_distance_m REAL NOT NULL,
      end_distance_m REAL NOT NULL,
      started_at_ms REAL NOT NULL,
      ended_at_ms REAL NOT NULL,
      duration_ms REAL NOT NULL,
      average_pace_seconds_per_km REAL NOT NULL,
      validated_quality TEXT NOT NULL,
      PRIMARY KEY(session_id, lap_index)
    );
    CREATE TABLE IF NOT EXISTS session_location_state (
      session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
      tracker_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_step_results (
      session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
      step_execution_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_kind TEXT NOT NULL,
      set_number INTEGER,
      elapsed_ms REAL NOT NULL,
      distance_m REAL,
      average_pace_seconds_per_km REAL,
      completion_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(session_id, step_execution_id)
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
      payload_json TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(entity_type, entity_id, operation)
    );
    CREATE INDEX IF NOT EXISTS sync_queue_next_attempt ON sync_queue(next_attempt_at);
    CREATE TABLE IF NOT EXISTS deleted_sessions (
      session_id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );
  `);
  // Existing installs keep their SQLite file across APK updates. Add columns
  // introduced by later phases instead of assuming CREATE TABLE upgrades it.
  await ensureColumn(db, 'running_sessions', 'workout_snapshot_json', 'TEXT');
  await ensureColumn(db, 'session_step_results', 'average_pace_seconds_per_km', 'REAL');
  await ensureColumn(db, 'session_step_results', 'completion_status', "TEXT NOT NULL DEFAULT 'completed'");
  return db;
}

export function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
}

/** Removes all runner-created data from this device while retaining the database schema. */
export async function clearAllLocalData(): Promise<void> {
  const db = await initializeDatabase();
  await db.withTransactionAsync(async () => {
    // Child records are removed by the foreign-key cascades on running_sessions.
    await db.execAsync(`
      DELETE FROM sync_queue;
      DELETE FROM running_sessions;
      DELETE FROM schema_meta WHERE key <> 'schema_version';
    `);
  });
}

export async function mergeRemoteRunningSessions(rows: RemoteRunningSession[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await initializeDatabase();
  const deletedRows = await db.getAllAsync<{ sessionId: string }>(
    `SELECT session_id AS sessionId FROM deleted_sessions`,
  );
  const deletedIds = new Set(deletedRows.map((row) => row.sessionId));
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      if (deletedIds.has(row.id)) continue;
      const now = row.updated_at ?? row.ended_at ?? row.started_at;
      const workoutSnapshot = row.mode === 'speedwork' ? JSON.stringify({ name: 'Interval', steps: [] }) : null;
      await db.runAsync(
        `INSERT INTO running_sessions
          (id, mode, run_type, status, started_at, ended_at, elapsed_ms, distance_m, workout_snapshot_json, created_at, updated_at)
         VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           elapsed_ms = excluded.elapsed_ms,
           distance_m = excluded.distance_m,
           updated_at = excluded.updated_at`,
        row.id,
        row.mode,
        row.mode === 'free_run' ? 'general' : null,
        row.started_at,
        row.ended_at,
        row.elapsed_ms ?? 0,
        row.distance_m ?? 0,
        workoutSnapshot,
        row.created_at ?? row.started_at,
        now,
      );
    }
  });
}

export async function createLocalSession(input: {
  mode: SessionMode;
  runType?: RunType;
  workoutSnapshot?: unknown;
}): Promise<string> {
  const db = await initializeDatabase();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO running_sessions
      (id, mode, run_type, status, started_at, workout_snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?)`,
    id,
    input.mode,
    input.runType ?? null,
    now,
    input.workoutSnapshot === undefined ? null : JSON.stringify(input.workoutSnapshot),
    now,
    now,
  );
  await db.runAsync(
    `INSERT OR REPLACE INTO session_location_state(session_id, tracker_json, updated_at)
     VALUES (?, ?, ?)`,
    id,
    JSON.stringify(createGpsTrackerState()),
    now,
  );
  return id;
}

export async function setActiveLocationSession(sessionId: string | null): Promise<void> {
  const db = await initializeDatabase();
  if (sessionId === null) {
    await db.runAsync(`DELETE FROM schema_meta WHERE key = 'active_location_session_id'`);
    return;
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO schema_meta(key, value) VALUES('active_location_session_id', ?)`,
    sessionId,
  );
}

export async function getActiveLocationSession(): Promise<string | null> {
  const db = await initializeDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM schema_meta WHERE key = 'active_location_session_id'`,
  );
  return row?.value ?? null;
}

export async function ingestGpsSample(input: {
  sessionId: string;
  sample: GpsSample;
  source: 'foreground' | 'background';
  monotonicMs?: number | null;
}): Promise<GpsSampleResult> {
  const db = await initializeDatabase();
  const row = await db.getFirstAsync<{ tracker_json: string }>(
    `SELECT tracker_json FROM session_location_state WHERE session_id = ?`,
    input.sessionId,
  );
  const tracker = row
    ? JSON.parse(row.tracker_json) as GpsTrackerState
    : createGpsTrackerState();
  const result = addGpsSample(tracker, input.sample);
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO gps_points
        (id, session_id, timestamp_ms, monotonic_ms, latitude, longitude,
         horizontal_accuracy_m, altitude_m, vertical_accuracy_m,
         cumulative_distance_m, quality, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Crypto.randomUUID(),
      input.sessionId,
      input.sample.timestampMs,
      input.monotonicMs ?? null,
      input.sample.latitude,
      input.sample.longitude,
      input.sample.horizontalAccuracyM,
      input.sample.altitudeM ?? null,
      input.sample.verticalAccuracyM ?? null,
      result.point.cumulativeDistanceM,
      result.point.quality,
      input.source,
      now,
    );
    for (const lap of result.completedLaps) {
      await db.runAsync(
        `INSERT OR IGNORE INTO session_auto_laps
          (session_id, lap_index, start_distance_m, end_distance_m, started_at_ms,
           ended_at_ms, duration_ms, average_pace_seconds_per_km, validated_quality)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated')`,
        input.sessionId,
        lap.lapIndex,
        lap.startDistanceM,
        lap.endDistanceM,
        lap.startedAtMs,
        lap.endedAtMs,
        lap.durationMs,
        lap.averagePaceSecondsPerKm,
      );
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO session_location_state(session_id, tracker_json, updated_at)
       VALUES (?, ?, ?)`,
      input.sessionId,
      JSON.stringify(result.state),
      now,
    );
    await db.runAsync(
      `UPDATE running_sessions SET distance_m = ?, updated_at = ? WHERE id = ?`,
      result.state.cumulativeDistanceM,
      now,
      input.sessionId,
    );
  });
  return result;
}

export async function getSessionGpsTracker(sessionId: string): Promise<GpsTrackerState> {
  const db = await initializeDatabase();
  const row = await db.getFirstAsync<{ tracker_json: string }>(
    `SELECT tracker_json FROM session_location_state WHERE session_id = ?`,
    sessionId,
  );
  return row ? JSON.parse(row.tracker_json) as GpsTrackerState : createGpsTrackerState();
}

export async function recordSessionStepResult(input: {
  sessionId: string;
  stepExecutionId: string;
  stepOrder: number;
  stepKind: string;
  setNumber?: number;
  elapsedMs: number;
  distanceM: number | null;
  completionStatus: 'completed' | 'partial' | 'skipped';
}): Promise<void> {
  const db = await initializeDatabase();
  const pace = input.distanceM !== null && input.distanceM > 0
    ? (input.elapsedMs / 1000) / (input.distanceM / 1000)
    : null;
  await db.runAsync(
    `INSERT OR REPLACE INTO session_step_results
      (session_id, step_execution_id, step_order, step_kind, set_number,
       elapsed_ms, distance_m, average_pace_seconds_per_km, completion_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.sessionId,
    input.stepExecutionId,
    input.stepOrder,
    input.stepKind,
    input.setNumber ?? null,
    Math.max(0, input.elapsedMs),
    input.distanceM,
    pace,
    input.completionStatus,
    new Date().toISOString(),
  );
}

export async function recordSessionEvent(input: {
  sessionId: string;
  sequence: number;
  type: string;
  elapsedMs: number;
  payload?: unknown;
}): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO session_events
      (id, session_id, event_seq, event_type, recorded_at, elapsed_ms, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `${input.sessionId}:${input.sequence}`,
    input.sessionId,
    input.sequence,
    input.type,
    new Date().toISOString(),
    Math.max(0, Math.round(input.elapsedMs)),
    JSON.stringify(input.payload ?? {}),
  );
}

export async function setSessionPaused(sessionId: string, paused: boolean): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync(
    `UPDATE running_sessions SET status = ?, updated_at = ? WHERE id = ?`,
    paused ? 'paused' : 'in_progress',
    new Date().toISOString(),
    sessionId,
  );
}

export async function updateSessionElapsed(sessionId: string, elapsedMs: number): Promise<void> {
  const db = await initializeDatabase();
  await db.runAsync(
    `UPDATE running_sessions SET elapsed_ms = ?, updated_at = ? WHERE id = ?`,
    Math.max(0, Math.round(elapsedMs)),
    new Date().toISOString(),
    sessionId,
  );
}

export async function getInProgressSessions(): Promise<InProgressSession[]> {
  const db = await initializeDatabase();
  return db.getAllAsync<InProgressSession>(
    `SELECT id, mode, status, started_at AS startedAt, elapsed_ms AS elapsedMs,
            distance_m AS distanceM, workout_snapshot_json AS workoutSnapshotJson
     FROM running_sessions
     WHERE status IN ('in_progress', 'paused')
     ORDER BY updated_at DESC`,
  );
}

export async function getInProgressSession(sessionId: string): Promise<InProgressSession | null> {
  const sessions = await getInProgressSessions();
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export async function finishLocalSession(input: {
  sessionId: string;
  elapsedMs: number;
  distanceM?: number;
  discarded?: boolean;
}): Promise<void> {
  const db = await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE running_sessions
     SET status = ?, ended_at = ?, elapsed_ms = ?, distance_m = ?, updated_at = ?
     WHERE id = ?`,
    input.discarded ? 'discarded' : 'completed',
    now,
    Math.max(0, Math.round(input.elapsedMs)),
    Math.max(0, input.distanceM ?? 0),
    now,
    input.sessionId,
  );
  const session = await db.getFirstAsync<{ id: string; mode: string; started_at: string; ended_at: string; elapsed_ms: number; distance_m: number }>(
    `SELECT id, mode, started_at, ended_at, elapsed_ms, distance_m FROM running_sessions WHERE id = ?`,
    input.sessionId,
  );
  if (session) {
    const payload = JSON.stringify({ ...session, sessionId: session.id });
    await db.runAsync(
      `INSERT INTO sync_queue(id, entity_type, entity_id, operation, payload_json, next_attempt_at, created_at, updated_at)
       VALUES(?, 'running_session', ?, 'upsert', ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id, operation) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      `sync-${session.id}`,
      session.id,
      payload,
      now,
      now,
      now,
    );
    if (!input.discarded) {
      const gpsPoints = await getActivityGpsPoints(session.id);
      for (const point of gpsPoints) {
        const pointId = point.id ?? `${session.id}-${point.timestampMs}`;
        await enqueueSyncRow(db, 'gps_point', pointId, { id: pointId, session_id: session.id, recorded_at: new Date(point.timestampMs).toISOString(), latitude: point.latitude, longitude: point.longitude, altitude_m: point.altitudeM, accuracy_m: null }, now);
      }
      for (const lap of await getActivityLaps(session.id)) {
        const lapId = `${session.id}-${lap.lapIndex}`;
        await enqueueSyncRow(db, 'session_lap', lapId, { id: lapId, session_id: session.id, lap_index: lap.lapIndex, distance_m: lap.distanceM, elapsed_ms: lap.durationMs, average_pace_seconds_per_km: lap.averagePaceSecondsPerKm }, now);
      }
      for (const record of (await getPersonalRecords()).filter((item) => item.sourceSessionId === session.id && item.durationMs !== null)) {
        await enqueueSyncRow(db, 'personal_best', String(record.distanceM), { id: Crypto.randomUUID(), distance_m: record.distanceM, elapsed_ms: record.durationMs, session_id: record.sourceSessionId, achieved_at: now }, now);
      }
    }
  }
}

async function enqueueSyncRow(db: SQLite.SQLiteDatabase, entityType: SyncQueueItem['entityType'], entityId: string, payload: Record<string, unknown>, now: string): Promise<void> {
  await db.runAsync(`INSERT INTO sync_queue(id, entity_type, entity_id, operation, payload_json, next_attempt_at, created_at, updated_at)
    VALUES(?, ?, ?, 'upsert', ?, ?, ?, ?) ON CONFLICT(entity_type, entity_id, operation) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    `sync-${entityType}-${entityId}`, entityType, entityId, JSON.stringify(payload), now, now, now);
}

export async function getPendingSyncItems(limit = 20): Promise<SyncQueueItem[]> {
  const db = await initializeDatabase();
  return db.getAllAsync<SyncQueueItem>(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, operation, payload_json AS payloadJson, attempts, next_attempt_at AS nextAttemptAt
     FROM sync_queue WHERE next_attempt_at <= ? ORDER BY created_at LIMIT ?`,
    new Date().toISOString(),
    limit,
  );
}

export async function markSyncItemAttempt(id: string, error?: string): Promise<void> {
  const db = await initializeDatabase();
  const now = new Date();
  const next = new Date(now.getTime() + 2 ** 0 * 30_000).toISOString();
  await db.runAsync(
    `UPDATE sync_queue SET attempts = attempts + 1, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
    next,
    error ?? null,
    now.toISOString(),
    id,
  );
}

export async function removeSyncItem(id: string): Promise<void> {
  const db = await initializeDatabase();
  const item = await db.getFirstAsync<{ entityType: string; entityId: string; operation: string }>(
    `SELECT entity_type AS entityType, entity_id AS entityId, operation FROM sync_queue WHERE id = ?`,
    id,
  );
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, id);
  if (item?.entityType === 'running_session' && item.operation === 'delete') {
    await db.runAsync(`DELETE FROM deleted_sessions WHERE session_id = ?`, item.entityId);
  }
}

export async function deleteCompletedSession(sessionId: string): Promise<void> {
  const db = await initializeDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const session = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM running_sessions WHERE id = ? AND status = 'completed'`,
      sessionId,
    );
    if (!session) throw new Error('ไม่พบกิจกรรมที่ต้องการลบ');

    const queuedItems = await db.getAllAsync<{ id: string; entityType: string; entityId: string; operation: string; payloadJson: string }>(
      `SELECT id, entity_type AS entityType, entity_id AS entityId, operation, payload_json AS payloadJson FROM sync_queue`,
    );
    for (const item of queuedItems) {
      let belongsToSession = item.entityType === 'running_session' && item.entityId === sessionId;
      try {
        const payload = JSON.parse(item.payloadJson) as { session_id?: unknown; sessionId?: unknown };
        belongsToSession ||= payload.session_id === sessionId || payload.sessionId === sessionId;
      } catch (error) {
        console.warn('Unable to inspect queued sync item while deleting activity', error);
      }
      if (belongsToSession) await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, item.id);
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO deleted_sessions(session_id, deleted_at) VALUES(?, ?)`,
      sessionId,
      now,
    );
    await db.runAsync(
      `INSERT INTO sync_queue(id, entity_type, entity_id, operation, payload_json, next_attempt_at, created_at, updated_at)
       VALUES(?, 'running_session', ?, 'delete', ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id, operation) DO UPDATE SET payload_json = excluded.payload_json, next_attempt_at = excluded.next_attempt_at, updated_at = excluded.updated_at`,
      `delete-${sessionId}`,
      sessionId,
      JSON.stringify({ id: sessionId }),
      now,
      now,
      now,
    );
    await db.runAsync(`DELETE FROM running_sessions WHERE id = ?`, sessionId);
  });
}

export async function getCompletedSessionCount(): Promise<number> {
  const db = await initializeDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM running_sessions WHERE status = 'completed'`,
  );
  return row?.count ?? 0;
}

export async function getProfileStats(): Promise<{ sessions: number; distanceM: number; elapsedMs: number; milestones: Record<string, number> }> {
  const db = await initializeDatabase();
  const rows = await db.getAllAsync<{ distanceM: number }>(`SELECT distance_m AS distanceM FROM running_sessions WHERE status = 'completed'`);
  const distanceM = rows.reduce((sum, row) => sum + (row.distanceM ?? 0), 0);
  const elapsed = await db.getFirstAsync<{ elapsedMs: number }>(`SELECT COALESCE(SUM(elapsed_ms), 0) AS elapsedMs FROM running_sessions WHERE status = 'completed'`);
  const milestones = Object.fromEntries([['800m', 800], ['1K', 1000], ['3K', 3000], ['5K', 5000], ['10K', 10000], ['Half', 21097.5], ['Marathon', 42195]].map(([label, threshold]) => [label, rows.some((row) => row.distanceM >= Number(threshold)) ? 1 : 0]));
  return { sessions: rows.length, distanceM, elapsedMs: elapsed?.elapsedMs ?? 0, milestones };
}

export interface PersonalRecord { label: string; distanceM: number; durationMs: number | null; sourceSessionId: string | null; }

function interpolatedTime(points: ActivityGpsPoint[], targetDistance: number): number | null {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    if (a.cumulativeDistanceM <= targetDistance && b.cumulativeDistanceM >= targetDistance && b.cumulativeDistanceM > a.cumulativeDistanceM) {
      const ratio = (targetDistance - a.cumulativeDistanceM) / (b.cumulativeDistanceM - a.cumulativeDistanceM);
      return a.timestampMs + (b.timestampMs - a.timestampMs) * ratio;
    }
  }
  return null;
}

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const db = await initializeDatabase();
  const sessions = await db.getAllAsync<{ id: string; distanceM: number }>(`SELECT id, distance_m AS distanceM FROM running_sessions WHERE status = 'completed'`);
  const targets = [['800m', 800], ['1K', 1000], ['3K', 3000], ['5K', 5000], ['10K', 10000], ['Half', 21097.5], ['Marathon', 42195]] as const;
  const best = new Map<string, PersonalRecord>(targets.map(([label, distanceM]) => [label, { label, distanceM, durationMs: null, sourceSessionId: null }]));
  let longest: PersonalRecord = { label: 'Longest Run', distanceM: 0, durationMs: null, sourceSessionId: null };
  for (const session of sessions) {
    if (session.distanceM > longest.distanceM) longest = { label: 'Longest Run', distanceM: session.distanceM, durationMs: null, sourceSessionId: session.id };
    const points = await getActivityGpsPoints(session.id);
    for (const [label, target] of targets) {
      if (points.length < 2 || points.at(-1)!.cumulativeDistanceM < target) continue;
      for (let start = 0; start < points.length - 1; start += 1) {
        const startDistance = points[start].cumulativeDistanceM;
        const startTime = points[start].timestampMs;
        const endTime = interpolatedTime(points, startDistance + target);
        if (endTime === null) continue;
        const durationMs = endTime - startTime;
        const current = best.get(label)!;
        if (durationMs > 0 && (current.durationMs === null || durationMs < current.durationMs)) best.set(label, { label, distanceM: target, durationMs, sourceSessionId: session.id });
      }
    }
  }
  return [...best.values(), longest];
}

export async function getRecentCompletedSessions(limit = 3): Promise<RecentSession[]> {
  const db = await initializeDatabase();
  return db.getAllAsync<RecentSession>(
    `SELECT id, mode, started_at AS startedAt, elapsed_ms AS elapsedMs, distance_m AS distanceM
     FROM running_sessions WHERE status = 'completed'
     ORDER BY ended_at DESC LIMIT ?`,
    Math.max(1, Math.min(20, Math.round(limit))),
  );
}

export async function getAllCompletedSessions(): Promise<RecentSession[]> {
  const db = await initializeDatabase();
  return db.getAllAsync<RecentSession>(
    `SELECT id, mode, started_at AS startedAt, elapsed_ms AS elapsedMs, distance_m AS distanceM
     FROM running_sessions WHERE status = 'completed'
     ORDER BY ended_at DESC`,
  );
}

export async function getActivityDetail(sessionId: string): Promise<ActivityDetail | null> {
  const db = await initializeDatabase();
  return db.getFirstAsync<ActivityDetail>(
    `SELECT id, mode, started_at AS startedAt, ended_at AS endedAt, elapsed_ms AS elapsedMs, distance_m AS distanceM
     FROM running_sessions WHERE id = ? AND status = 'completed'`,
    sessionId,
  );
}

export async function getActivityGpsPoints(sessionId: string): Promise<ActivityGpsPoint[]> {
  const db = await initializeDatabase();
  return db.getAllAsync<ActivityGpsPoint>(
    `SELECT id, latitude, longitude, altitude_m AS altitudeM, timestamp_ms AS timestampMs,
            cumulative_distance_m AS cumulativeDistanceM
     FROM gps_points WHERE session_id = ? ORDER BY timestamp_ms ASC`,
    sessionId,
  );
}

export const getSessionGpsPoints = getActivityGpsPoints;

export async function getActivityLaps(sessionId: string): Promise<ActivityLap[]> {
  const db = await initializeDatabase();
  const stored = await db.getAllAsync<ActivityLap>(
    `SELECT lap_index AS lapIndex, (end_distance_m - start_distance_m) AS distanceM,
            duration_ms AS durationMs, average_pace_seconds_per_km AS averagePaceSecondsPerKm,
            validated_quality AS validatedQuality
     FROM session_auto_laps WHERE session_id = ? ORDER BY lap_index ASC`,
    sessionId,
  );
  return stored;
}

export async function saveCustomWorkout(workout: WorkoutDefinition): Promise<{ destination: 'cloud' | 'local'; cloudError?: string }> {
  const db = await initializeDatabase();
  const definition = withStableWorkoutId(workout);
  const definitionJson = JSON.stringify(definition);
  await db.runAsync(
    `INSERT OR REPLACE INTO schema_meta(key, value) VALUES('custom_workout_json', ?)`,
    definitionJson,
  );
  if (!supabase) return { destination: 'local' };
  const { data, error: authError } = await supabase.auth.getSession();
  if (authError) return { destination: 'local', cloudError: authError.message };
  if (!data.session) return { destination: 'local' };
  const { error } = await supabase.from('workout_presets').upsert({
    id: definition.id,
    user_id: data.session.user.id,
    name: definition.name,
    definition,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) return { destination: 'local', cloudError: error.message };
  return { destination: 'cloud' };
}

export async function getCustomWorkout(): Promise<WorkoutDefinition | null> {
  const db = await initializeDatabase();
  const readLocal = async (): Promise<WorkoutDefinition | null> => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM schema_meta WHERE key = 'custom_workout_json'`,
    );
    if (!row) return null;
    try {
      const definition = JSON.parse(row.value) as WorkoutDefinition;
      assertValidWorkout(definition);
      return definition;
    } catch (error) {
      console.warn('Unable to load saved workout preset', error);
      return null;
    }
  };
  if (supabase) {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (authData.session) {
      const { data, error } = await supabase
        .from('workout_presets')
        .select('id, definition')
        .eq('user_id', authData.session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data?.[0]?.definition) {
        const definition = { ...(data[0].definition as WorkoutDefinition), id: data[0].id };
        assertValidWorkout(definition);
        await db.runAsync(
          `INSERT OR REPLACE INTO schema_meta(key, value) VALUES('custom_workout_json', ?)`,
          JSON.stringify(definition),
        );
        return definition;
      }
      const localDefinition = await readLocal();
      if (localDefinition) {
        const definition = withStableWorkoutId(localDefinition);
        await db.runAsync(
          `INSERT OR REPLACE INTO schema_meta(key, value) VALUES('custom_workout_json', ?)`,
          JSON.stringify(definition),
        );
        const { error: uploadError } = await supabase.from('workout_presets').upsert({
          id: definition.id,
          user_id: authData.session.user.id,
          name: definition.name,
          definition,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (uploadError) throw uploadError;
        return definition;
      }
    }
  }
  return readLocal();
}

function withStableWorkoutId(workout: WorkoutDefinition): WorkoutDefinition {
  const hasUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workout.id);
  return hasUuid ? workout : { ...workout, id: Crypto.randomUUID() };
}
