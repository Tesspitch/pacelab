import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

export type SessionMode = 'free_run' | 'speedwork';
export type RunType = 'easy' | 'recovery' | 'long' | 'general';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('pace_lab.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_meta(key, value) VALUES('schema_version', '2');
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
  `);
  return db;
}

export function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase();
  return databasePromise;
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
  return id;
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
}

export async function getCompletedSessionCount(): Promise<number> {
  const db = await initializeDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM running_sessions WHERE status = 'completed'`,
  );
  return row?.count ?? 0;
}
