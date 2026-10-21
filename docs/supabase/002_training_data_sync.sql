-- PaceLab Phase 4: training data sync extension
create table if not exists public.workout_presets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_laps (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.running_sessions(id) on delete cascade,
  lap_index integer not null,
  distance_m double precision not null default 0,
  elapsed_ms bigint not null default 0,
  average_pace_seconds_per_km double precision,
  created_at timestamptz not null default now(),
  unique(session_id, lap_index)
);

create table if not exists public.gps_points (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.running_sessions(id) on delete cascade,
  recorded_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  altitude_m double precision,
  accuracy_m double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_bests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  distance_m double precision not null,
  elapsed_ms bigint not null,
  session_id uuid references public.running_sessions(id) on delete set null,
  achieved_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique(user_id, distance_m)
);

create table if not exists public.sync_conflicts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  local_payload jsonb not null,
  remote_payload jsonb,
  resolution text not null default 'pending' check (resolution in ('pending', 'local_wins', 'remote_wins')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_workout_presets_user on public.workout_presets(user_id, updated_at desc);
create index if not exists idx_session_laps_session on public.session_laps(session_id, lap_index);
create index if not exists idx_gps_points_session on public.gps_points(session_id, recorded_at);
create index if not exists idx_personal_bests_user on public.personal_bests(user_id, distance_m);
create index if not exists idx_sync_conflicts_user on public.sync_conflicts(user_id, resolution);

alter table public.workout_presets enable row level security;
alter table public.session_laps enable row level security;
alter table public.gps_points enable row level security;
alter table public.personal_bests enable row level security;
alter table public.sync_conflicts enable row level security;

create policy "workout presets own rows" on public.workout_presets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "session laps own rows" on public.session_laps for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gps points own rows" on public.gps_points for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal bests own rows" on public.personal_bests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sync conflicts own rows" on public.sync_conflicts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
