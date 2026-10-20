-- PaceLab V6.4 | Supabase PostgreSQL | DRAFT migration v001
-- Run ONLY against a development Supabase project after review.
-- UUIDs are generated on device and retained through sync.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 units text NOT NULL DEFAULT 'metric' CHECK (units IN ('metric','imperial')),
 countdown_seconds smallint NOT NULL DEFAULT 5 CHECK (countdown_seconds IN (3,5,10)),
 countdown_pre_start boolean NOT NULL DEFAULT true,
 countdown_work_end boolean NOT NULL DEFAULT true,
 countdown_next_work boolean NOT NULL DEFAULT true,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workout_templates (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title text NOT NULL, description text, schema_version integer NOT NULL DEFAULT 1,
 definition jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE (id,user_id)
);
CREATE INDEX workout_templates_user_idx ON public.workout_templates(user_id, updated_at DESC);

CREATE TABLE public.running_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 template_id uuid, mode text NOT NULL CHECK (mode IN ('free_run','speedwork')),
 run_type text CHECK (run_type IN ('easy','recovery','long','general')),
 status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','paused','completed','discarded')),
 started_at timestamptz NOT NULL, ended_at timestamptz,
 elapsed_ms bigint NOT NULL DEFAULT 0 CHECK (elapsed_ms>=0),
 moving_ms bigint NOT NULL DEFAULT 0 CHECK (moving_ms>=0),
 distance_m double precision NOT NULL DEFAULT 0 CHECK (distance_m>=0),
 workout_snapshot jsonb, -- immutable per-session snapshot of expanded workout steps and options
 gps_quality text CHECK (gps_quality IN ('good','fair','poor','unknown')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz, revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 CHECK (ended_at IS NULL OR ended_at>=started_at),
 CHECK (mode <> 'speedwork' OR workout_snapshot IS NOT NULL),
 CHECK (mode <> 'free_run' OR run_type IS NOT NULL),
 FOREIGN KEY (template_id,user_id) REFERENCES public.workout_templates(id,user_id) ON DELETE SET NULL (template_id),
 UNIQUE(id,user_id)
);
CREATE INDEX sessions_user_started_idx ON public.running_sessions(user_id,started_at DESC);
CREATE INDEX sessions_user_status_idx ON public.running_sessions(user_id,status);

CREATE TABLE public.session_events (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 event_seq integer NOT NULL CHECK(event_seq>=0), event_type text NOT NULL CHECK (event_type IN ('start','pause','resume','finish','discard','gps_lost','gps_recovered','step_transition')),
 recorded_at timestamptz NOT NULL, elapsed_ms bigint CHECK(elapsed_ms>=0), payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(session_id,event_seq)
);
CREATE TABLE public.session_laps (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 lap_number integer NOT NULL CHECK(lap_number>0),
 is_partial boolean NOT NULL DEFAULT false, started_elapsed_ms bigint NOT NULL CHECK(started_elapsed_ms>=0),
 ended_elapsed_ms bigint NOT NULL CHECK(ended_elapsed_ms>=started_elapsed_ms),
 distance_m double precision NOT NULL CHECK(distance_m>=0),
 avg_pace_ms_per_km double precision CHECK(avg_pace_ms_per_km>0),
 average_cadence_spm double precision CHECK(average_cadence_spm>0),
 UNIQUE(session_id,lap_number)
);
CREATE TABLE public.session_step_results (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 step_index integer NOT NULL CHECK(step_index>=0), block_index integer,
 repetition_index integer, step_kind text NOT NULL CHECK (step_kind IN ('warmup','work','recovery','cooldown','other')),
 target_kind text CHECK (target_kind IN ('time','distance','open')),
 target_value double precision CHECK(target_value>0),
 started_elapsed_ms bigint NOT NULL CHECK(started_elapsed_ms>=0),
 ended_elapsed_ms bigint NOT NULL CHECK(ended_elapsed_ms>=started_elapsed_ms),
 actual_distance_m double precision NOT NULL DEFAULT 0 CHECK(actual_distance_m>=0),
 avg_pace_ms_per_km double precision CHECK(avg_pace_ms_per_km>0),
 average_cadence_spm double precision CHECK(average_cadence_spm>0),
 UNIQUE(session_id,step_index)
);
CREATE TABLE public.gps_points (
 session_id uuid NOT NULL REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 sample_seq integer NOT NULL CHECK(sample_seq>=0), recorded_at timestamptz NOT NULL,
 elapsed_ms bigint NOT NULL CHECK(elapsed_ms>=0),
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 horizontal_accuracy_m double precision CHECK(horizontal_accuracy_m>=0),
 altitude_m double precision, vertical_accuracy_m double precision CHECK(vertical_accuracy_m>=0),
 speed_mps double precision, cumulative_distance_m double precision CHECK(cumulative_distance_m>=0),
 accepted boolean NOT NULL DEFAULT true, source text NOT NULL DEFAULT 'device',
 PRIMARY KEY(session_id,sample_seq)
);
CREATE INDEX gps_points_time_idx ON public.gps_points(session_id,recorded_at);
CREATE TABLE public.sensor_samples (
 session_id uuid NOT NULL REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 sample_seq integer NOT NULL CHECK(sample_seq>=0), recorded_at timestamptz NOT NULL,
 elapsed_ms bigint NOT NULL CHECK(elapsed_ms>=0), cadence_spm double precision CHECK(cadence_spm>0),
 altitude_m double precision, grade_percent double precision,
 altitude_accuracy_m double precision CHECK(altitude_accuracy_m>=0),
 source text NOT NULL, confidence text CHECK(confidence IN ('high','medium','low','unknown')),
 PRIMARY KEY(session_id,sample_seq)
);
CREATE TABLE public.session_statistics (
 session_id uuid PRIMARY KEY REFERENCES public.running_sessions(id) ON DELETE CASCADE,
 avg_pace_ms_per_km double precision CHECK(avg_pace_ms_per_km>0),
 moving_pace_ms_per_km double precision CHECK(moving_pace_ms_per_km>0),
 best_valid_pace_ms_per_km double precision CHECK(best_valid_pace_ms_per_km>0),
 elevation_gain_m double precision CHECK(elevation_gain_m>=0),
 elevation_loss_m double precision CHECK(elevation_loss_m>=0),
 altitude_min_m double precision, altitude_max_m double precision,
 cadence_avg_spm double precision CHECK(cadence_avg_spm>0),
 cadence_max_spm double precision CHECK(cadence_max_spm>0),
 work_distance_m double precision CHECK(work_distance_m>=0),
 work_duration_ms bigint CHECK(work_duration_ms>=0),
 computation_version integer NOT NULL DEFAULT 1, computed_at timestamptz NOT NULL DEFAULT now(),
 CHECK (altitude_min_m IS NULL OR altitude_max_m IS NULL OR altitude_min_m<=altitude_max_m)
);
CREATE TABLE public.personal_records (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 record_type text NOT NULL CHECK(record_type IN ('800m','1k','3k','5k','10k','half_marathon','marathon','longest_run')),
 session_id uuid NOT NULL, result_ms bigint CHECK(result_ms>0),
 distance_m double precision NOT NULL CHECK(distance_m>0),
 segment_start_elapsed_ms bigint CHECK(segment_start_elapsed_ms>=0),
 segment_end_elapsed_ms bigint CHECK(segment_end_elapsed_ms>=segment_start_elapsed_ms),
 gps_quality_validated boolean NOT NULL DEFAULT false,
 achieved_at timestamptz NOT NULL,
 UNIQUE(user_id,record_type),
 FOREIGN KEY (session_id,user_id) REFERENCES public.running_sessions(id,user_id) ON DELETE CASCADE,
 CHECK ((record_type='longest_run' AND result_ms IS NULL) OR (record_type<>'longest_run' AND result_ms IS NOT NULL))
);
CREATE TABLE public.activity_shares (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
 public_payload jsonb NOT NULL, -- explicitly sanitized summary; NO full GPS route / home coordinates
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
 revoked_at timestamptz,
 FOREIGN KEY (session_id,user_id) REFERENCES public.running_sessions(id,user_id) ON DELETE CASCADE
);
CREATE INDEX activity_shares_user_idx ON public.activity_shares(user_id,created_at DESC);

-- Enable RLS. Policies do not grant anonymous reads. Public share MUST be served
-- through a rate-limited server endpoint validating token hash, expiry, revocation
-- and returning only a whitelisted sanitized payload. Never expose service-role keys.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_laps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_step_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_owner ON public.profiles FOR ALL TO authenticated USING (id=(SELECT auth.uid())) WITH CHECK(id=(SELECT auth.uid()));
CREATE POLICY preferences_owner ON public.user_preferences FOR ALL TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY templates_owner ON public.workout_templates FOR ALL TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY sessions_owner ON public.running_sessions FOR ALL TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY records_owner ON public.personal_records FOR ALL TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY shares_owner ON public.activity_shares FOR ALL TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));

CREATE POLICY session_events_owner ON public.session_events FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
CREATE POLICY laps_owner ON public.session_laps FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
CREATE POLICY steps_owner ON public.session_step_results FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
CREATE POLICY gps_owner ON public.gps_points FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
CREATE POLICY sensors_owner ON public.sensor_samples FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
CREATE POLICY statistics_owner ON public.session_statistics FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.running_sessions s WHERE s.id=session_id AND s.user_id=(SELECT auth.uid())));
COMMIT;
