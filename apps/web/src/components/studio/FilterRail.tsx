"use client";

import { signOut } from "@/lib/auth/actions";
import { MOODS } from "@/lib/studio/constants";
import { uniqueGenres } from "@/lib/studio/format";
import { BpmRange } from "./BpmRange";
import { CamelotMatrix } from "./CamelotMatrix";
import { useStudio } from "./StudioProvider";

export function FilterRail({
  compact = false,
  signedIn = false,
}: {
  compact?: boolean;
  signedIn?: boolean;
}) {
  const s = useStudio();
  const { filters } = s;
  const selectedGenres = filters.genres ?? [];

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#1B1F27] px-3 py-2">
        <span className="tabular text-[12px] text-[#B7BEC9]">{s.visible.length.toLocaleString()}</span>
        <button
          type="button"
          className="text-[12px] text-[#E9A63C]"
          onClick={() => s.setAdvancedOpen(!s.advancedOpen)}
        >
          Filters
        </button>
        {s.filterCount > 0 ? (
          <button type="button" className="text-[12px] text-[#E9A63C]" onClick={s.clearFilters}>
            Clear {s.filterCount}
          </button>
        ) : null}
      </div>
    );
  }

  const bpmReadout = filters.bpmNearSeed && s.seed?.bpm != null
    ? `${Math.round(s.seed.bpm - 4)}–${Math.round(s.seed.bpm + 4)}`
    : `${Math.round(filters.bpmMin)}–${Math.round(filters.bpmMax)}`;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-r border-[#1B1F27] bg-[#0D0F13] px-3.5 py-4">
      <nav aria-label="Library" className="grid gap-0.5">
        <NavRow
          label="All records"
          count={s.tracks.length}
          current={s.libraryView === "all" && !s.seed}
          onClick={() => {
            s.setLibraryView("all");
            s.setSeed(null);
          }}
        />
        <NavRow
          label="Recently added"
          count={s.recentCount}
          current={s.libraryView === "recent"}
          onClick={() => {
            s.setSeed(null);
            s.setLibraryView("recent");
          }}
        />
        <NavRow
          label="Unplayed"
          count={s.unplayedCount}
          current={s.libraryView === "unplayed"}
          onClick={() => {
            s.setSeed(null);
            s.setLibraryView("unplayed");
          }}
        />
      </nav>

      <div className="my-4 h-px bg-[#171B21]" />

      <div className="flex items-center justify-between px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">BPM</span>
        <span className="text-[12px] text-[#EDEFF3]">{bpmReadout}</span>
      </div>
      <div className="mt-2.5 px-2.5">
        <BpmRange
          min={s.bpmBounds.min}
          max={s.bpmBounds.max}
          lo={filters.bpmMin}
          hi={filters.bpmMax}
          onChange={({ lo, hi }) => s.setFilters({ ...filters, bpmMin: lo, bpmMax: hi })}
        />
        {s.seed?.bpm != null ? (
          <button
            type="button"
            aria-pressed={filters.bpmNearSeed}
            onClick={() => s.setFilters({ ...filters, bpmNearSeed: !filters.bpmNearSeed })}
            className="mt-2 rounded-full border px-2.5 py-1 text-[11.5px]"
            style={{
              color: filters.bpmNearSeed ? "#181203" : "#98A0AE",
              background: filters.bpmNearSeed ? "#E9A63C" : "transparent",
              borderColor: filters.bpmNearSeed ? "#E9A63C" : "#262B34",
            }}
          >
            near seed ±4
          </button>
        ) : null}
      </div>

      <div className="my-4 h-px bg-[#171B21]" />
      <CamelotMatrix
        selected={filters.keys}
        onToggle={(key) =>
          s.setFilters({
            ...filters,
            keys: filters.keys.includes(key)
              ? filters.keys.filter((item) => item !== key)
              : [...filters.keys, key],
          })
        }
        onClear={() => s.setFilters({ ...filters, keys: [], compatibleKeys: false })}
      />

      <div className="my-4 h-px bg-[#171B21]" />
      <div className="px-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">Vibe</span>
          {filters.moods.length ? (
            <button
              type="button"
              className="bg-transparent text-[11.5px] text-[#E9A63C]"
              onClick={() => s.setFilters({ ...filters, moods: [] })}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {MOODS.map((mood) => (
            <FilterChip
              key={mood}
              label={mood}
              on={filters.moods.includes(mood)}
              capitalize
              onClick={() => s.setFilters({ ...filters, moods: toggleValue(filters.moods, mood) })}
            />
          ))}
        </div>
      </div>

      <div className="my-4 h-px bg-[#171B21]" />
      <div className="px-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">Genre</span>
          {selectedGenres.length ? (
            <button
              type="button"
              className="bg-transparent text-[11.5px] text-[#E9A63C]"
              onClick={() => s.setFilters({ ...filters, genres: [] })}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {uniqueGenres(s.tracks).map((genre) => (
            <FilterChip
              key={genre}
              label={genre}
              on={selectedGenres.some((item) => item.toLowerCase() === genre.toLowerCase())}
              onClick={() => s.setFilters({ ...filters, genres: toggleValue(selectedGenres, genre) })}
            />
          ))}
        </div>
      </div>

      <div className="my-4 h-px bg-[#171B21]" />
      <div className="flex items-center justify-between px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">Crates</span>
        <button
          type="button"
          aria-label="New crate"
          className="bg-transparent text-[14px] text-[#98A0AE]"
          onClick={s.createCrate}
        >
          +
        </button>
      </div>
      <div className="mt-2.5 grid gap-px">
        {s.crates.map((crate) => {
          const active = crate.id === s.activeCrateId && s.sidecar === "crate";
          return (
            <div
              key={crate.id}
              className="flex h-8 items-center gap-2 rounded-[7px] px-2.5"
              style={{ background: active ? "#181C24" : "transparent" }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 bg-transparent p-0 text-left"
                onClick={() => s.openCrate(crate.id)}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
                  style={{ background: s.crateColor(crate.id) }}
                />
                <span className="truncate text-[12.5px] text-[#EDEFF3]">{crate.name}</span>
              </button>
              <span className="shrink-0 text-[11.5px] text-[#6B7383]">{crate.trackIds.length}</span>
              <button
                type="button"
                aria-label={`Duplicate ${crate.name}`}
                className="shrink-0 bg-transparent text-[11px] text-[#5B6373]"
                onClick={() => s.duplicateCrate(crate.id)}
              >
                ⎘
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-[#1B1F27] pt-3 text-[12px] text-[#8B929F]">
        {signedIn ? (
          <div className="flex items-center justify-between px-2.5">
            <span>
              <a href="/import" className="hover:text-[#EDEFF3]">
                Import
              </a>
              <span className="mx-2 text-[#1B1F27]">/</span>
              <a href="/analysis" className="hover:text-[#EDEFF3]">
                Analysis
              </a>
            </span>
            <form action={signOut}>
              <button type="submit" className="hover:text-[#EDEFF3]">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <span className="px-2.5">
            {s.librarySource === "disk"
              ? "Local-only mode"
              : s.librarySource === "preview"
                ? "Preview · R2 session"
                : "Prototype · mock library"}
          </span>
        )}
      </div>
    </aside>
  );
}

function toggleValue<T extends string>(list: T[], item: T): T[] {
  const match = list.find((value) => value.toLowerCase() === item.toLowerCase());
  if (match) return list.filter((value) => value !== match);
  return [...list, item];
}

function FilterChip({
  label,
  on,
  onClick,
  capitalize = false,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  capitalize?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${capitalize ? "capitalize" : ""}`}
      style={{
        color: on ? "#181203" : "#98A0AE",
        background: on ? "#E9A63C" : "transparent",
        borderColor: on ? "#E9A63C" : "#262B34",
      }}
    >
      {label}
    </button>
  );
}

function NavRow({
  label,
  count,
  current,
  onClick,
}: {
  label: string;
  count: number;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[31px] items-center gap-2.5 rounded-[7px] px-2.5 text-[13px]"
      style={{
        background: current ? "#181C24" : "transparent",
        color: current ? "#EDEFF3" : "#98A0AE",
      }}
    >
      {label}
      <span className="ml-auto text-[11.5px] text-[#6B7383]">{count.toLocaleString()}</span>
    </button>
  );
}
