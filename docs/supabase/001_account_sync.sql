-- Phase 4 foundation. Apply in Supabase SQL editor after reviewing policies.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.running_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('free_run', 'speedwork')),
  started_at timestamptz not null,
  ended_at timestamptz,
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),
  distance_m double precision not null default 0 check (distance_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.running_sessions enable row level security;
create policy "profiles own row" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "sessions own rows" on public.running_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
