-- PaceLab V6.4 | On-device SQLite schema v001
-- IDs are UUID TEXT generated on device. SQLite timestamps are ISO-8601 UTC TEXT.
-- SQLite booleans are INTEGER (0/1), JSON stored in TEXT columns.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO schema_meta(key,value) VALUES('schema_version','1');
CREATE TABLE IF NOT EXISTS user_preferences (
 user_id TEXT PRIMARY KEY, units TEXT NOT NULL DEFAULT 'metric' CHECK(units IN ('metric','imperial')),
 countdown_seconds INTEGER NOT NULL DEFAULT 5 CHECK(countdown_seconds IN (3,5,10)),
 countdown_pre_start INTEGER NOT NULL DEFAULT 1 CHECK(countdown_pre_start IN (0,1)),
 countdown_work_end INTEGER NOT NULL DEFAULT 1 CHECK(countdown_work_end IN (0,1)),
 countdown_next_work INTEGER NOT NULL DEFAULT 1 CHECK(countdown_next_work IN (0,1)),
 settings_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workout_templates (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT,
 schema_version INTEGER NOT NULL DEFAULT 1,definition_json TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,
 UNIQUE(id,user_id)
);
CREATE TABLE IF NOT EXISTS running_sessions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,template_id TEXT,
 mode TEXT NOT NULL CHECK(mode IN ('free_run','speedwork')),
 run_type TEXT CHECK(run_type IN ('easy','recovery','long','general')),
 status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','paused','completed','discarded')),
 started_at TEXT NOT NULL,ended_at TEXT,
 elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms>=0),moving_ms INTEGER NOT NULL DEFAULT 0 CHECK(moving_ms>=0),
 distance_m REAL NOT NULL DEFAULT 0 CHECK(distance_m>=0),workout_snapshot_json TEXT,
 gps_quality TEXT CHECK(gps_quality IN ('good','fair','poor','unknown')),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 CHECK(mode<>'speedwork' OR workout_snapshot_json IS NOT NULL),
 CHECK(mode<>'free_run' OR run_type IS NOT NULL),
 FOREIGN KEY(template_id,user_id) REFERENCES workout_templates(id,user_id) ON DELETE NO ACTION,
 UNIQUE(id,user_id)
);
CREATE INDEX IF NOT EXISTS local_sessions_user_started ON running_sessions(user_id,started_at DESC);
CREATE TABLE IF NOT EXISTS session_events (
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
 event_seq INTEGER NOT NULL,event_type TEXT NOT NULL CHECK(event_type IN ('start','pause','resume','finish','discard','gps_lost','gps_recovered','step_transition')),
 recorded_at TEXT NOT NULL,elapsed_ms INTEGER,payload_json TEXT NOT NULL DEFAULT '{}',UNIQUE(session_id,event_seq)
);
CREATE TABLE IF NOT EXISTS session_laps (
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
 lap_number INTEGER NOT NULL CHECK(lap_number>0),is_partial INTEGER NOT NULL DEFAULT 0 CHECK(is_partial IN (0,1)),
 started_elapsed_ms INTEGER NOT NULL,ended_elapsed_ms INTEGER NOT NULL,
 distance_m REAL NOT NULL CHECK(distance_m>=0),avg_pace_ms_per_km REAL,average_cadence_spm REAL,
 CHECK(ended_elapsed_ms>=started_elapsed_ms),UNIQUE(session_id,lap_number)
);
CREATE TABLE IF NOT EXISTS session_step_results (
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
 step_index INTEGER NOT NULL,block_index INTEGER,repetition_index INTEGER,
 step_kind TEXT NOT NULL CHECK(step_kind IN ('warmup','work','recovery','cooldown','other')),
 target_kind TEXT CHECK(target_kind IN ('time','distance','open')),target_value REAL,
 started_elapsed_ms INTEGER NOT NULL,ended_elapsed_ms INTEGER NOT NULL,
 actual_distance_m REAL NOT NULL DEFAULT 0,avg_pace_ms_per_km REAL,average_cadence_spm REAL,
 CHECK(ended_elapsed_ms>=started_elapsed_ms),UNIQUE(session_id,step_index)
);
CREATE TABLE IF NOT EXISTS gps_points (
 session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
 sample_seq INTEGER NOT NULL,recorded_at TEXT NOT NULL,elapsed_ms INTEGER NOT NULL,
 latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 horizontal_accuracy_m REAL,altitude_m REAL,vertical_accuracy_m REAL,speed_mps REAL,
 cumulative_distance_m REAL,accepted INTEGER NOT NULL DEFAULT 1 CHECK(accepted IN (0,1)),
 source TEXT NOT NULL DEFAULT 'device',PRIMARY KEY(session_id,sample_seq)
);
CREATE INDEX IF NOT EXISTS local_gps_time ON gps_points(session_id,recorded_at);
CREATE TABLE IF NOT EXISTS sensor_samples (
 session_id TEXT NOT NULL REFERENCES running_sessions(id) ON DELETE CASCADE,
 sample_seq INTEGER NOT NULL,recorded_at TEXT NOT NULL,elapsed_ms INTEGER NOT NULL,
 cadence_spm REAL,altitude_m REAL,grade_percent REAL,altitude_accuracy_m REAL,
 source TEXT NOT NULL,confidence TEXT CHECK(confidence IN ('high','medium','low','unknown')),
 PRIMARY KEY(session_id,sample_seq)
);
CREATE TABLE IF NOT EXISTS session_statistics (
 session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
 avg_pace_ms_per_km REAL,moving_pace_ms_per_km REAL,best_valid_pace_ms_per_km REAL,
 elevation_gain_m REAL,elevation_loss_m REAL,altitude_min_m REAL,altitude_max_m REAL,
 cadence_avg_spm REAL,cadence_max_spm REAL,work_distance_m REAL,work_duration_ms INTEGER,
 computation_version INTEGER NOT NULL DEFAULT 1,computed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_records (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,record_type TEXT NOT NULL CHECK(record_type IN ('800m','1k','3k','5k','10k','half_marathon','marathon','longest_run')),
 session_id TEXT NOT NULL,result_ms INTEGER,distance_m REAL NOT NULL,
 segment_start_elapsed_ms INTEGER,segment_end_elapsed_ms INTEGER,
 gps_quality_validated INTEGER NOT NULL DEFAULT 0,achieved_at TEXT NOT NULL,
 UNIQUE(user_id,record_type),FOREIGN KEY(session_id,user_id) REFERENCES running_sessions(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS activity_shares (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,public_payload_json TEXT NOT NULL,
 created_at TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,
 FOREIGN KEY(session_id,user_id) REFERENCES running_sessions(id,user_id) ON DELETE CASCADE
);
-- Only local: durable recording recovery and eventual sync (offline-first).
CREATE TABLE IF NOT EXISTS session_checkpoints (
 session_id TEXT PRIMARY KEY REFERENCES running_sessions(id) ON DELETE CASCADE,
 updated_at TEXT NOT NULL,engine_state_json TEXT NOT NULL,last_gps_seq INTEGER,last_sensor_seq INTEGER
);
CREATE TABLE IF NOT EXISTS sync_outbox (
 id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
 revision INTEGER NOT NULL,payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_flight','retry','done')),
 attempts INTEGER NOT NULL DEFAULT 0,next_retry_at TEXT,created_at TEXT NOT NULL,
 last_error TEXT,UNIQUE(entity_type,entity_id,revision)
);
CREATE INDEX IF NOT EXISTS sync_outbox_pending ON sync_outbox(status,next_retry_at,created_at);
COMMIT;
