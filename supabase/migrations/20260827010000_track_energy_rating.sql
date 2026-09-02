-- Keep DJ-library star rating separate from an energy-level rating.
-- `rating` remains the Rekordbox 0-5 rating; `energy_rating` is the
-- optional 1-10 energy value carried by compatible audio tags/tools.

alter table public.tracks
  add column if not exists energy_rating smallint;

alter table public.tracks
  drop constraint if exists tracks_energy_rating_check;

alter table public.tracks
  add constraint tracks_energy_rating_check
  check (energy_rating is null or energy_rating between 1 and 10);
