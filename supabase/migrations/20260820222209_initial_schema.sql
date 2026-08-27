-- Crate Dig initial schema
--
-- Embeddings: model output can vary by backend (librosa ~70-d, CLAP 512-d,
-- Essentia 1280-d). Store the raw vector as real[] plus a fixed search column:
--   embedding vector(512)  -- deep/CLAP (and later normalized 512-d models)
-- Map/fast similarity uses cluster_members.reduced_embedding vector(64).
-- cluster_members is an extra table beyond the handoff list; the map needs
-- per-track coordinates and cluster membership.

create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- access_codes
-- ---------------------------------------------------------------------------
create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  note text,
  max_redemptions integer not null default 1 check (max_redemptions >= 1),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  access_code_id uuid references public.access_codes (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- libraries
-- ---------------------------------------------------------------------------
create table public.libraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Library',
  source text not null default 'upload'
    check (source in ('upload', 'rekordbox_xml', 'desktop')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index libraries_user_id_idx on public.libraries (user_id);

create trigger libraries_set_updated_at
before update on public.libraries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tracks
-- ---------------------------------------------------------------------------
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  external_track_id text,
  title text not null default '',
  artist text not null default '',
  album text not null default '',
  genre text not null default '',
  label text not null default '',
  bpm double precision,
  key text not null default '',
  duration_sec double precision,
  rating integer not null default 0,
  date_added text not null default '',
  location_kind text not null default 'file'
    check (location_kind in ('file', 'missing', 'pseudo', 'empty')),
  original_location text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index tracks_library_id_idx on public.tracks (library_id);
create unique index tracks_library_external_id_idx
  on public.tracks (library_id, external_track_id)
  where external_track_id is not null;

-- ---------------------------------------------------------------------------
-- audio_objects (R2 keys; never commit local personal paths as canonical storage)
-- ---------------------------------------------------------------------------
create table public.audio_objects (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  kind text not null
    check (kind in ('original', 'preview', 'waveform', 'artifact')),
  bucket text not null,
  object_key text not null,
  content_type text,
  byte_size bigint,
  sha256 text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (track_id, kind, object_key)
);

create index audio_objects_track_id_idx on public.audio_objects (track_id);

-- ---------------------------------------------------------------------------
-- analysis_runs
-- ---------------------------------------------------------------------------
create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  mode text not null default 'fast' check (mode in ('fast', 'deep')),
  backend_name text not null default 'librosa',
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  pipeline_version text not null default '1.0.0',
  model_version text not null default '',
  feature_schema_version text not null default '1.0.0',
  tracks_total integer not null default 0,
  tracks_done integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index analysis_runs_library_id_idx on public.analysis_runs (library_id);

-- ---------------------------------------------------------------------------
-- track_features
-- ---------------------------------------------------------------------------
create table public.track_features (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  audio_file_hash text,
  status text not null check (status in ('ok', 'failed', 'skipped')),
  failure_reason text,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (track_id, analysis_run_id)
);

create index track_features_run_idx on public.track_features (analysis_run_id);

-- ---------------------------------------------------------------------------
-- track_embeddings
-- ---------------------------------------------------------------------------
create table public.track_embeddings (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  model_name text not null,
  dimensions integer not null check (dimensions > 0),
  embedding_raw real[] not null default '{}',
  embedding extensions.vector(512),
  created_at timestamptz not null default timezone('utc', now()),
  unique (track_id, analysis_run_id, model_name)
);

create index track_embeddings_run_idx on public.track_embeddings (analysis_run_id);
create index track_embeddings_embedding_hnsw
  on public.track_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

-- ---------------------------------------------------------------------------
-- clusters + per-track membership (map coordinates)
-- ---------------------------------------------------------------------------
create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  cluster_index integer not null,
  name text not null default '',
  suggested_moment text not null default '',
  track_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_run_id, cluster_index)
);

create table public.cluster_members (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  cluster_id uuid references public.clusters (id) on delete set null,
  umap_x double precision not null,
  umap_y double precision not null,
  suggested_moment text not null default '',
  reduced_embedding extensions.vector(64),
  created_at timestamptz not null default timezone('utc', now()),
  unique (analysis_run_id, track_id)
);

create index cluster_members_cluster_id_idx on public.cluster_members (cluster_id);
create index cluster_members_reduced_hnsw
  on public.cluster_members
  using hnsw (reduced_embedding extensions.vector_cosine_ops)
  where reduced_embedding is not null;

-- ---------------------------------------------------------------------------
-- crates
-- ---------------------------------------------------------------------------
create table public.crates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_id uuid references public.libraries (id) on delete set null,
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index crates_user_id_idx on public.crates (user_id);

create trigger crates_set_updated_at
before update on public.crates
for each row execute function public.set_updated_at();

create table public.crate_tracks (
  crate_id uuid not null references public.crates (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (crate_id, track_id)
);

create index crate_tracks_track_id_idx on public.crate_tracks (track_id);

-- ---------------------------------------------------------------------------
-- Q
-- ---------------------------------------------------------------------------
create table public.q_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_id uuid references public.libraries (id) on delete set null,
  title text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index q_conversations_user_id_idx on public.q_conversations (user_id);

create table public.q_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.q_conversations (id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index q_actions_conversation_id_idx on public.q_actions (conversation_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.access_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.libraries enable row level security;
alter table public.tracks enable row level security;
alter table public.audio_objects enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.track_features enable row level security;
alter table public.track_embeddings enable row level security;
alter table public.clusters enable row level security;
alter table public.cluster_members enable row level security;
alter table public.crates enable row level security;
alter table public.crate_tracks enable row level security;
alter table public.q_conversations enable row level security;
alter table public.q_actions enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "libraries_owner_all"
  on public.libraries for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "tracks_via_library"
  on public.tracks for all
  to authenticated
  using (
    exists (
      select 1 from public.libraries l
      where l.id = tracks.library_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.libraries l
      where l.id = tracks.library_id and l.user_id = auth.uid()
    )
  );

create policy "audio_objects_via_library"
  on public.audio_objects for all
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = audio_objects.track_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = audio_objects.track_id and l.user_id = auth.uid()
    )
  );

create policy "analysis_runs_via_library"
  on public.analysis_runs for all
  to authenticated
  using (
    exists (
      select 1 from public.libraries l
      where l.id = analysis_runs.library_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.libraries l
      where l.id = analysis_runs.library_id and l.user_id = auth.uid()
    )
  );

create policy "track_features_via_library"
  on public.track_features for all
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_features.track_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_features.track_id and l.user_id = auth.uid()
    )
  );

create policy "track_embeddings_via_library"
  on public.track_embeddings for all
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_embeddings.track_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_embeddings.track_id and l.user_id = auth.uid()
    )
  );

create policy "clusters_via_run"
  on public.clusters for all
  to authenticated
  using (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = clusters.analysis_run_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = clusters.analysis_run_id and l.user_id = auth.uid()
    )
  );

create policy "cluster_members_via_run"
  on public.cluster_members for all
  to authenticated
  using (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = cluster_members.analysis_run_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = cluster_members.analysis_run_id and l.user_id = auth.uid()
    )
  );

create policy "crates_owner_all"
  on public.crates for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "crate_tracks_via_crate"
  on public.crate_tracks for all
  to authenticated
  using (
    exists (
      select 1 from public.crates c
      where c.id = crate_tracks.crate_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.crates c
      where c.id = crate_tracks.crate_id and c.user_id = auth.uid()
    )
  );

create policy "q_conversations_owner_all"
  on public.q_conversations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "q_actions_via_conversation"
  on public.q_actions for all
  to authenticated
  using (
    exists (
      select 1 from public.q_conversations q
      where q.id = q_actions.conversation_id and q.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.q_conversations q
      where q.id = q_actions.conversation_id and q.user_id = auth.uid()
    )
  );

-- Access codes are redeemed by the API with the service role. No anon/auth policies.

grant usage on schema public to anon, authenticated, service_role;

grant select, update on table public.profiles to authenticated;
grant all on table public.libraries to authenticated;
grant all on table public.tracks to authenticated;
grant all on table public.audio_objects to authenticated;
grant all on table public.analysis_runs to authenticated;
grant all on table public.track_features to authenticated;
grant all on table public.track_embeddings to authenticated;
grant all on table public.clusters to authenticated;
grant all on table public.cluster_members to authenticated;
grant all on table public.crates to authenticated;
grant all on table public.crate_tracks to authenticated;
grant all on table public.q_conversations to authenticated;
grant all on table public.q_actions to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
