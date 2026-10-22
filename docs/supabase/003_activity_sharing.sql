-- Phase 5: private activity sharing. Tokens are generated and hashed server-side.
create table if not exists public.activity_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.running_sessions(id) on delete cascade,
  token_hash text not null unique,
  scopes jsonb not null default '{"summary":true,"splits":false}'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.share_snapshots (
  share_id uuid primary key references public.activity_shares(id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_activity_shares_session on public.activity_shares(session_id);
alter table public.activity_shares enable row level security;
alter table public.share_snapshots enable row level security;
create policy "activity shares owner access" on public.activity_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "share snapshots owner access" on public.share_snapshots
  for all using (exists (select 1 from public.activity_shares s where s.id = share_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.activity_shares s where s.id = share_id and s.owner_id = auth.uid()));
