-- Let preview/cloud demo readers see Cloud Run analysis coordinates.
-- Writes remain owner-only via the existing analysis_runs/clusters policies.

create policy "analysis_runs_demo_select"
  on public.analysis_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.libraries l
      where l.id = analysis_runs.library_id and l.source = 'demo'
    )
  );

create policy "clusters_demo_select"
  on public.clusters for select
  to authenticated
  using (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = clusters.analysis_run_id and l.source = 'demo'
    )
  );

create policy "cluster_members_demo_select"
  on public.cluster_members for select
  to authenticated
  using (
    exists (
      select 1
      from public.analysis_runs r
      join public.libraries l on l.id = r.library_id
      where r.id = cluster_members.analysis_run_id and l.source = 'demo'
    )
  );
