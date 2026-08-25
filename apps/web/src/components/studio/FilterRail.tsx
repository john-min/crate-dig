"use client";

import { useStudio } from "./StudioProvider";
import { BPM_BOUNDS, ENERGIES, MOODS, TEXTURES } from "@/lib/studio/constants";
import { formatBpm } from "@/lib/studio/format";
import { Wordmark } from "@/components/brand/Wordmark";
import { signOut } from "@/lib/auth/actions";
import type { Energy, Mood, Texture } from "@/lib/studio/types";

const CAMELLOT = ["8A", "9A", "10A", "7A", "8B", "9B"];

export function FilterRail({
  compact = false,
  signedIn = false,
}: {
  compact?: boolean;
  signedIn?: boolean;
}) {
  const s = useStudio();
  const { filters } = s;

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-2">
        <Wordmark href={signedIn ? "/app" : "/map"} size="sm" />
        <span className="tabular text-[12px] text-paper-dim">{s.visible.length.toLocaleString()}</span>
        <Chip
          label="Filters"
          on={s.filterCount > 0}
          onClick={() => s.setAdvancedOpen(!s.advancedOpen)}
        />
        {s.filterCount > 0 ? (
          <button type="button" className="text-[12px] text-amber hover:text-paper" onClick={s.clearFilters}>
            Clear {s.filterCount}
          </button>
        ) : null}
        <button
          type="button"
          className="ml-auto text-[12px] text-paper-dim hover:text-paper"
          onClick={s.openQ}
        >
          Ask Q
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-ink">
      <div className="flex h-12 items-center px-4">
        <Wordmark href={signedIn ? "/app" : "/map"} size="sm" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <p className="text-[12px] text-paper-dim">
          <span className="tabular text-paper">{s.visible.length.toLocaleString()}</span>
          {" of "}
          <span className="tabular">{s.tracks.length.toLocaleString()}</span> records
        </p>

        <nav className="mt-5 flex flex-col gap-0.5" aria-label="Library">
          <NavRow label="All records" count={s.tracks.length} current={!s.seed} onClick={() => s.setSeed(null)} />
          <NavRow
            label="Near selected"
            count={s.seed ? s.candidates.length : 0}
            current={Boolean(s.seed)}
            onClick={() => {
              if (s.primarySelected) s.setSeed(s.primarySelected.id);
            }}
          />
        </nav>

        <Section title="BPM">
          <p className="tabular text-[13px] text-paper-dim">
            {Math.round(filters.bpmMin)} – {Math.round(filters.bpmMax)}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <input
              type="range"
              min={BPM_BOUNDS.min}
              max={BPM_BOUNDS.max}
              value={filters.bpmMin}
              aria-label="Minimum BPM"
              className="w-full accent-amber"
              onChange={(e) =>
                s.setFilters({ ...filters, bpmMin: Math.min(Number(e.target.value), filters.bpmMax) })
              }
            />
            <input
              type="range"
              min={BPM_BOUNDS.min}
              max={BPM_BOUNDS.max}
              value={filters.bpmMax}
              aria-label="Maximum BPM"
              className="w-full accent-amber"
              onChange={(e) =>
                s.setFilters({ ...filters, bpmMax: Math.max(Number(e.target.value), filters.bpmMin) })
              }
            />
          </div>
          {s.seed?.bpm != null ? (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-paper-dim">
              <input
                type="checkbox"
                checked={filters.bpmNearSeed}
                onChange={(e) => s.setFilters({ ...filters, bpmNearSeed: e.target.checked })}
              />
              {formatBpm(s.seed.bpm)} BPM ±4
            </label>
          ) : null}
        </Section>

        <Section title="Key">
          <div className="flex flex-wrap gap-1.5">
            {CAMELLOT.map((key) => (
              <Chip
                key={key}
                label={key}
                on={filters.keys.includes(key)}
                onClick={() =>
                  s.setFilters({
                    ...filters,
                    keys: filters.keys.includes(key)
                      ? filters.keys.filter((k) => k !== key)
                      : [...filters.keys, key],
                  })
                }
              />
            ))}
          </div>
          {s.seed ? (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-paper-dim">
              <input
                type="checkbox"
                checked={filters.compatibleKeys}
                onChange={(e) => s.setFilters({ ...filters, compatibleKeys: e.target.checked })}
              />
              Compatible keys
            </label>
          ) : null}
        </Section>

        <Section title="Mood / energy">
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((mood) => (
              <Chip
                key={mood}
                label={mood}
                on={filters.moods.includes(mood)}
                onClick={() => toggleMood(s, mood)}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ENERGIES.map((energy) => (
              <Chip
                key={energy}
                label={energy}
                on={filters.energies.includes(energy)}
                onClick={() => toggleEnergy(s, energy)}
              />
            ))}
          </div>
        </Section>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="text-[13px] text-paper-dim hover:text-paper"
            onClick={() => s.setAdvancedOpen(!s.advancedOpen)}
            aria-expanded={s.advancedOpen}
          >
            More filters
          </button>
          {s.filterCount > 0 ? (
            <button type="button" className="text-[13px] text-amber hover:text-paper" onClick={s.clearFilters}>
              Clear all
              <span className="ml-1 tabular">({s.filterCount})</span>
            </button>
          ) : (
            <span className="text-[12px] text-[var(--text-disabled)]">No filters</span>
          )}
        </div>

        {s.advancedOpen ? (
          <Section title="Texture">
            <div className="flex flex-wrap gap-1.5">
              {TEXTURES.map((texture) => (
                <Chip
                  key={texture}
                  label={texture}
                  on={filters.textures.includes(texture)}
                  onClick={() => toggleTexture(s, texture)}
                />
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Crates">
          <ul className="flex flex-col gap-0.5">
            {s.crates.map((crate) => (
              <li key={crate.id}>
                <button
                  type="button"
                  onClick={() => s.setActiveCrateId(crate.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] ${
                    crate.id === s.activeCrateId ? "bg-ink-hover text-paper" : "text-paper-dim hover:text-paper"
                  }`}
                >
                  {crate.name}
                  <span className="tabular text-[12px] text-muted">{crate.trackIds.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <nav className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-[12px] text-muted">
        {signedIn ? (
          <>
            <span>
              <a href="/import" className="hover:text-paper">
                Import
              </a>
              <span className="mx-2 text-line">/</span>
              <a href="/analysis" className="hover:text-paper">
                Analysis
              </a>
            </span>
            <form action={signOut}>
              <button type="submit" className="hover:text-paper">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <span>Prototype · mock library</span>
        )}
      </nav>
    </aside>
  );
}

function toggleMood(s: ReturnType<typeof useStudio>, mood: Mood) {
  const on = s.filters.moods.includes(mood);
  s.setFilters({
    ...s.filters,
    moods: on ? s.filters.moods.filter((m) => m !== mood) : [...s.filters.moods, mood],
  });
}

function toggleEnergy(s: ReturnType<typeof useStudio>, energy: Energy) {
  const on = s.filters.energies.includes(energy);
  s.setFilters({
    ...s.filters,
    energies: on ? s.filters.energies.filter((e) => e !== energy) : [...s.filters.energies, energy],
  });
}

function toggleTexture(s: ReturnType<typeof useStudio>, texture: Texture) {
  const on = s.filters.textures.includes(texture);
  s.setFilters({
    ...s.filters,
    textures: on ? s.filters.textures.filter((t) => t !== texture) : [...s.filters.textures, texture],
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 text-[12px] font-medium tracking-[0.12em] text-paper-dim uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on ?? false}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[12px] capitalize ${
        on ? "border-amber/50 bg-ink-hover text-paper" : "border-line text-paper-dim hover:text-paper"
      }`}
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
  current?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] ${
        current ? "bg-ink-hover text-paper" : "text-paper-dim hover:text-paper"
      }`}
    >
      {label}
      <span className="tabular text-[12px] text-muted">{count.toLocaleString()}</span>
    </button>
  );
}
