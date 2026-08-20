import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { signOut } from "@/lib/auth/actions";
import type { MapFilters } from "@/components/map/types";
import { BPM_BOUNDS, toggleInList } from "@/components/map/filters";

const CRATES = ["Sunset lounge", "Warm-up", "Peak-time", "Afterhours"];
const ENERGY = ["Low", "Medium", "Peak", "Driving"];
const MOOD = ["Warm", "Euphoric", "Dark", "Dreamy", "Hypnotic"];

export function FilterRail({
  filters = {},
  onFiltersChange,
}: {
  filters?: MapFilters;
  onFiltersChange?: (filters: MapFilters) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-ink">
      <div className="flex h-12 items-center px-4">
        <Wordmark href="/app" size="sm" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <label className="block">
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder="Tracks, artists, or a vibe…"
            className="h-9 w-full rounded-md border border-line bg-ink-raised px-3 text-[13px] text-paper outline-none placeholder:text-muted focus:border-amber/40"
          />
        </label>

        <Section title="Energy">
          <ChipRow items={ENERGY} />
        </Section>
        <Section title="Mood">
          <ChipRow
            items={MOOD}
            active={filters.moods ?? []}
            onToggle={(item) =>
              onFiltersChange?.({
                ...filters,
                moods: toggleInList(filters.moods, item.toLowerCase()),
              })
            }
          />
        </Section>
        <Section title="BPM">
          <BpmRange
            min={filters.bpmMin ?? BPM_BOUNDS.min}
            max={filters.bpmMax ?? BPM_BOUNDS.max}
            onChange={(bpmMin, bpmMax) => onFiltersChange?.({ ...filters, bpmMin, bpmMax })}
          />
        </Section>
        <Section title="Crates">
          <ul className="flex flex-col gap-1">
            {CRATES.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-paper-dim hover:bg-ink-hover hover:text-paper"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <nav className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-[12px] text-muted">
        <span>
          <Link href="/import" className="hover:text-paper">
            Import
          </Link>
          <span className="mx-2 text-line">/</span>
          <Link href="/analysis" className="hover:text-paper">
            Analysis
          </Link>
        </span>
        <form action={signOut}>
          <button type="submit" className="hover:text-paper">
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 text-[11px] uppercase tracking-[0.16em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function ChipRow({
  items,
  active = [],
  onToggle,
}: {
  items: string[];
  active?: string[];
  onToggle?: (item: string) => void;
}) {
  const activeSet = new Set(active.map((item) => item.toLowerCase()));
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const on = activeSet.has(item.toLowerCase());
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle?.(item)}
            className={`rounded-full border px-2.5 py-1 text-[12px] ${
              on
                ? "border-amber/50 bg-ink-hover text-paper"
                : "border-line text-paper-dim hover:border-amber/40 hover:text-paper"
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

function BpmRange({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div>
      <p className="tabular-nums text-[13px] text-muted">
        {Math.round(min)} – {Math.round(max)}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        <input
          type="range"
          min={BPM_BOUNDS.min}
          max={BPM_BOUNDS.max}
          value={min}
          onChange={(e) => onChange(Math.min(Number(e.target.value), max), max)}
          className="w-full accent-amber"
          aria-label="Minimum BPM"
        />
        <input
          type="range"
          min={BPM_BOUNDS.min}
          max={BPM_BOUNDS.max}
          value={max}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min))}
          className="w-full accent-amber"
          aria-label="Maximum BPM"
        />
      </div>
    </div>
  );
}
