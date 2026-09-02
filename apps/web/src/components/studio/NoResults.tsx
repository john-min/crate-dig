"use client";

import { useStudio } from "./StudioProvider";

export function NoResults() {
  const s = useStudio();
  return (
    <div className="flex h-full min-h-0 flex-col items-start justify-center px-8">
      <h2 className="font-serif text-[1.75rem] tracking-tight">No records in this view</h2>
      <p className="mt-3 max-w-[46ch] text-[14px] leading-6 text-paper-dim">
        Filters hid every analyzed record. The library is unchanged. Loosen the search, or ask Q to
        look with fewer constraints.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="h-10 rounded-full bg-amber px-4 text-[14px] font-medium text-ink hover:bg-amber/90"
          onClick={s.clearFilters}
        >
          Clear all filters
        </button>
        <button
          type="button"
          className="h-10 rounded-full border border-line px-4 text-[14px] hover:border-amber/40"
          onClick={() =>
            s.setFilters({
              ...s.filters,
              bpmMin: Math.max(s.bpmBounds.min, s.filters.bpmMin - 4),
              bpmMax: Math.min(s.bpmBounds.max, s.filters.bpmMax + 4),
              bpmNearSeed: false,
            })
          }
        >
          Widen BPM range
        </button>
        <button
          type="button"
          className="h-10 rounded-full border border-line px-4 text-[14px] hover:border-amber/40"
          onClick={() => s.setFilters({ ...s.filters, compatibleKeys: false, keys: [] })}
        >
          Include adjacent keys
        </button>
        <button
          type="button"
          className="h-10 rounded-full border border-line px-4 text-[14px] hover:border-amber/40"
          onClick={() => s.askQ("Loosen this search")}
        >
          Ask Q to loosen search
        </button>
        <button
          type="button"
          className="h-10 rounded-full border border-line px-4 text-[14px] hover:border-amber/40"
          onClick={() => {
            s.clearFilters();
            s.setSeed(null);
          }}
        >
          Search whole library
        </button>
      </div>
    </div>
  );
}
