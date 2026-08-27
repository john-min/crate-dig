-- Local/dev seed only. Do not put production invite codes here.

insert into public.access_codes (code, note, max_redemptions)
values ('CRATEDIG-DEV', 'Local development access code', 100)
on conflict (code) do nothing;

-- Demo library (operator SQL, after you have a profile uuid and R2 objects):
-- insert into public.libraries (user_id, name, source)
-- values ('<operator-profile-uuid>', 'Crate Dig demo', 'demo');
-- insert into public.tracks (library_id, title, artist, bpm, key, duration_sec)
-- values ('<library-uuid>', 'Example', 'Demo', 124, '8A', 360);
-- insert into public.audio_objects (track_id, kind, bucket, object_key, content_type)
-- values (
--   '<track-uuid>',
--   'original',
--   'crate-dig-audio-dev',
--   'libraries/<library-uuid>/originals/<track-uuid>/example.wav',
--   'audio/wav'
-- );
