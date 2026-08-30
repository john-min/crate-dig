-- Shared web-demo catalog: authenticated users can read source='demo'
-- libraries and their tracks/audio. Writes stay owner-only (operator account).
-- Playback still uses short-lived R2 GET signatures; this only exposes object keys.

alter table public.libraries drop constraint if exists libraries_source_check;
alter table public.libraries
  add constraint libraries_source_check
  check (source in ('upload', 'rekordbox_xml', 'desktop', 'demo'));

create policy "libraries_demo_select"
  on public.libraries for select
  to authenticated
  using (source = 'demo');

create policy "tracks_demo_select"
  on public.tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.libraries l
      where l.id = tracks.library_id and l.source = 'demo'
    )
  );

create policy "audio_objects_demo_select"
  on public.audio_objects for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = audio_objects.track_id and l.source = 'demo'
    )
  );

create policy "track_features_demo_select"
  on public.track_features for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_features.track_id and l.source = 'demo'
    )
  );

create policy "track_embeddings_demo_select"
  on public.track_embeddings for select
  to authenticated
  using (
    exists (
      select 1
      from public.tracks t
      join public.libraries l on l.id = t.library_id
      where t.id = track_embeddings.track_id and l.source = 'demo'
    )
  );
