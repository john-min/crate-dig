"use client";

import type { ColorBy, MapFilters, PlotTrack } from "./types";
import { BPM_BOUNDS, toggleInList } from "./filters";
import { clusterRgb, cssRgb, moodRgb } from "./colors";

type LegendItem = { key: string; label: string; count: number; rgb: [number, number, number] };

type Props = {
  colorBy: ColorBy;
  onColorBy: (value: ColorBy) => void;
  filters: MapFilters;
  onFilters: (next: MapFilters) => void;
  visibleCount: number;
  totalCount: number;
  usingFixture: boolean;
  legend: LegendItem[];
  selected: PlotTrack | null;
  playingId: string | null;
  seedIds: Set<string>;
  hover: { x: number; y: number; track: PlotTrack } | null;
  onFit: () => void;
  onClearSelection: () => void;
  onPlay: (track: PlotTrack) => void;
  onToggleSeed: (track: PlotTrack) => void;
};

export function MapOverlays({
  colorBy,
  onColorBy,
  filters,
  onFilters,
  visibleCount,
  totalCount,
  usingFixture,
  legend,
  selected,
  playingId,
  seedIds,
  hover,
  onFit,
  onClearSelection,
  onPlay,
  onToggleSeed,
}: Props) {
  const bpmMin = filters.bpmMin ?? BPM_BOUNDS.min;
  const bpmMax = filters.bpmMax ?? BPM_BOUNDS.max;
  const activeMoods = (filters.moods ?? []).map((m) => m.toLowerCase());
  const activeClusters = new Set(filters.clusters ?? []);

  return (
    <>
      {hover && !selected && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] rounded-md border border-line bg-ink-raised/95 px-2.5 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
          style={{
            left: Math.min(hover.x + 14, 10000),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="truncate text-[13px] font-medium text-paper">{hover.track.title}</p>
          <p className="truncate text-[12px] text-paper-dim">{hover.track.artist}</p>
          <p className="mt-1 tabular-nums text-[11px] text-muted">
            {hover.track.bpm != null ? `${Math.round(hover.track.bpm)} BPM` : "—"}
            {hover.track.key ? ` · ${hover.track.key}` : ""}
          </p>
        </div>
      )}

      <div className="pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[22rem] flex-col gap-3">
        <div className="rounded-lg border border-line bg-ink/88 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Segmented
              value={colorBy}
              onChange={onColorBy}
              options={[
                { value: "cluster", label: "Cluster" },
                { value: "mood", label: "Mood" },
              ]}
            />
            <button
              type="button"
              onClick={onFit}
              className="ml-auto h-7 rounded-md border border-line px-2 text-[11px] uppercase tracking-[0.12em] text-paper-dim hover:border-amber/40 hover:text-paper"
            >
              Fit
            </button>
          </div>
          <label className="mt-3 block">
            <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted">
              BPM
              <span className="tabular-nums tracking-normal text-paper-dim">
                {Math.round(bpmMin)}–{Math.round(bpmMax)}
              </span>
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="range"
                min={BPM_BOUNDS.min}
                max={BPM_BOUNDS.max}
                value={bpmMin}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onFilters({ ...filters, bpmMin: Math.min(next, bpmMax) });
                }}
                className="w-full accent-amber"
              />
              <input
                type="range"
                min={BPM_BOUNDS.min}
                max={BPM_BOUNDS.max}
                value={bpmMax}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onFilters({ ...filters, bpmMax: Math.max(next, bpmMin) });
                }}
                className="w-full accent-amber"
              />
            </div>
          </label>
          <p className="mt-2 tabular-nums text-[12px] text-muted">
            {visibleCount.toLocaleString()} of {totalCount.toLocaleString()}
            {usingFixture ? " · synthetic library" : ""}
          </p>
        </div>
      </div>

      <aside className="pointer-events-auto absolute bottom-3 right-3 z-10 max-h-[46%] w-52 overflow-auto rounded-lg border border-line bg-ink/88 px-3 py-2.5 backdrop-blur-sm">
        <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted">
          {colorBy === "cluster" ? "Clusters" : "Moods"}
        </p>
        <ul className="flex flex-col gap-0.5">
          {legend.map((item) => {
            const active =
              colorBy === "mood"
                ? activeMoods.length === 0 || activeMoods.includes(item.key)
                : activeClusters.size === 0 || activeClusters.has(Number(item.key));
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (colorBy === "mood") {
                      onFilters({ ...filters, moods: toggleInList(filters.moods, item.key) });
                    } else {
                      onFilters({
                        ...filters,
                        clusters: toggleInList(filters.clusters, Number(item.key)),
                      });
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] ${
                    active ? "text-paper" : "text-muted"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: cssRgb(item.rgb, active ? 1 : 0.35) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="tabular-nums text-[11px] text-muted">{item.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {selected && (
        <article className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[22rem] max-w-[calc(100%-1.5rem)] rounded-lg border border-line bg-ink/92 px-3.5 py-3 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif text-[1.35rem] leading-tight tracking-tight text-paper">
                {selected.title}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-paper-dim">{selected.artist}</p>
            </div>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[11px] uppercase tracking-[0.12em] text-muted hover:text-paper"
            >
              Close
            </button>
          </div>
          <p className="mt-2 tabular-nums text-[12px] text-muted">
            {selected.bpm != null ? `${selected.bpm.toFixed(selected.bpm % 1 ? 1 : 0)} BPM` : "BPM —"}
            {selected.key ? ` · ${selected.key}` : ""}
            {selected.mood ? ` · ${selected.mood}` : ""}
          </p>
          <p className="mt-1 text-[12px] text-paper-dim">
            {selected.clusterName}
            {selected.suggestedMoment ? ` · ${selected.suggestedMoment}` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onPlay(selected)}
              className="h-8 rounded-full bg-amber px-3.5 text-[12px] font-medium text-ink hover:bg-amber/90"
            >
              {playingId === selected.id ? "Playing" : "Cue"}
            </button>
            <button
              type="button"
              onClick={() => onToggleSeed(selected)}
              className="h-8 rounded-full border border-line px-3.5 text-[12px] text-paper hover:border-amber/50"
            >
              {seedIds.has(selected.id) ? "Seeded" : "Use as seed"}
            </button>
          </div>
        </article>
      )}
    </>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-7 rounded px-2.5 text-[11px] uppercase tracking-[0.12em] ${
            value === option.value ? "bg-ink-hover text-paper" : "text-muted hover:text-paper"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function buildLegend(
  tracks: PlotTrack[],
  colorBy: ColorBy,
): { key: string; label: string; count: number; rgb: [number, number, number] }[] {
  const counts = new Map<string, { label: string; count: number; rgb: [number, number, number] }>();
  for (const track of tracks) {
    if (colorBy === "mood") {
      const key = track.mood.toLowerCase();
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { label: key, count: 1, rgb: moodRgb(key) });
    } else {
      const key = String(track.cluster);
      const current = counts.get(key);
      if (current) current.count += 1;
      else {
        counts.set(key, {
          label: track.clusterName,
          count: 1,
          rgb: clusterRgb(track.cluster),
        });
      }
    }
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count);
}
