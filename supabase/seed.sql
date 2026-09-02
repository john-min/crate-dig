-- Local/dev seed only. Do not put production invite codes here.

insert into public.access_codes (code, note, max_redemptions)
values ('CRATEDIG-DEV', 'Local development access code', 100)
on conflict (code) do nothing;

-- Shared demo catalog: python3 scripts/seed-demo-library.py
-- (Rekordbox ID3 tags from apps/web/src/data/preview-track-studio.json)
