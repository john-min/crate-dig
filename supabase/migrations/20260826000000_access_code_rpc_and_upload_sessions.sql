-- Atomic access-code redemption (workstream 7E) and pending R2 upload sessions.
-- Access-code RPCs are SECURITY DEFINER so anon/authenticated clients never
-- read public.access_codes directly. Upload sessions are user-owned under RLS.

-- ---------------------------------------------------------------------------
-- validate_access_code: lookup only, no increment
-- ---------------------------------------------------------------------------
create or replace function public.validate_access_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := btrim(coalesce(p_code, ''));
  code_row public.access_codes%rowtype;
begin
  if trimmed = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter an access code.');
  end if;

  select * into code_row
  from public.access_codes
  where code = trimmed;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That code is not valid.');
  end if;

  if code_row.expires_at is not null and code_row.expires_at < timezone('utc', now()) then
    return jsonb_build_object('ok', false, 'error', 'That code has expired.');
  end if;

  if code_row.redemption_count >= code_row.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'That code has already been used.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', code_row.id,
    'code', code_row.code
  );
end;
$$;

revoke all on function public.validate_access_code(text) from public;
grant execute on function public.validate_access_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- redeem_access_code: one transaction, one increment, profile association
-- Authenticated callers are bound to auth.uid(). Service role may pass p_user_id
-- for email-confirm sign-up before a session exists. A zero-row increment is
-- denial. Profile association failure raises and rolls the increment back.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_access_code(p_code text, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := btrim(coalesce(p_code, ''));
  jwt_uid uuid := auth.uid();
  uid uuid;
  existing uuid;
  claimed public.access_codes%rowtype;
begin
  if jwt_uid is not null then
    if p_user_id is not null and p_user_id <> jwt_uid then
      return jsonb_build_object(
        'ok', false,
        'error', 'Could not redeem that code for this account.'
      );
    end if;
    uid := jwt_uid;
  else
    uid := p_user_id;
  end if;

  if uid is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'You must be signed in to redeem an access code.'
    );
  end if;

  if trimmed = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter an access code.');
  end if;

  select access_code_id into existing
  from public.profiles
  where id = uid
  for update;

  if existing is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.access_codes
  set redemption_count = redemption_count + 1
  where code = trimmed
    and redemption_count < max_redemptions
    and (expires_at is null or expires_at >= timezone('utc', now()))
  returning * into claimed;

  if not found then
    perform 1 from public.access_codes where code = trimmed;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'That code is not valid.');
    end if;
    perform 1
    from public.access_codes
    where code = trimmed
      and expires_at is not null
      and expires_at < timezone('utc', now());
    if found then
      return jsonb_build_object('ok', false, 'error', 'That code has expired.');
    end if;
    return jsonb_build_object('ok', false, 'error', 'That code has already been used.');
  end if;

  update public.profiles
  set access_code_id = claimed.id
  where id = uid
    and access_code_id is null;

  if not found then
    raise exception 'access_code_profile_association_failed'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'id', claimed.id);
end;
$$;

revoke all on function public.redeem_access_code(text, uuid) from public;
grant execute on function public.redeem_access_code(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- upload_sessions: pending signed R2 uploads before track rows exist
-- ---------------------------------------------------------------------------
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  library_id uuid not null references public.libraries (id) on delete cascade,
  object_key text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'expired', 'aborted')),
  expires_at timestamptz not null,
  track_id uuid references public.tracks (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index upload_sessions_user_id_idx on public.upload_sessions (user_id);
create index upload_sessions_library_id_idx on public.upload_sessions (library_id);
create unique index upload_sessions_object_key_idx on public.upload_sessions (object_key);

alter table public.upload_sessions enable row level security;

create policy "upload_sessions_owner_all"
  on public.upload_sessions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant all on table public.upload_sessions to authenticated;
grant all on table public.upload_sessions to service_role;
