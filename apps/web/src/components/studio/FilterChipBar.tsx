"use client";

import { useStudio } from "./StudioProvider";

export function FilterChipBar() {
  const s = useStudio();
  const { filters } = s;
  const bpmLabel = `${Math.round(filters.bpmMin)}–${Math.round(filters.bpmMax)}`;
  const keyLabel = filters.compatibleKeys
    ? `${s.seed?.key ?? "8A"} +1`
    : filters.keys[0] ?? null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--hairline)] px-3 py-2">
      {filters.moods.map((mood) => (
        <Chip
          key={mood}
          label={mood}
          active
          onClick={() =>
            s.setFilters({ ...filters, moods: filters.moods.filter((m) => m !== mood) })
          }
        />
      ))}
      {filters.energies.map((energy) => (
        <Chip
          key={energy}
          label={energy}
          onClick={() =>
            s.setFilters({
              ...filters,
              energies: filters.energies.filter((e) => e !== energy),
            })
          }
        />
      ))}
      <Chip
        label={bpmLabel}
        active={filters.bpmMin > 108 || filters.bpmMax < 136}
        onClick={() => s.setAdvancedOpen(true)}
      />
      {keyLabel ? (
        <Chip label={keyLabel} active={filters.compatibleKeys || filters.keys.length > 0} onClick={() => s.setAdvancedOpen(true)} />
      ) : (
        <Chip label="8A +1" onClick={() => s.setFilters({ ...filters, compatibleKeys: true })} />
      )}
      <button
        type="button"
        className="ml-auto shrink-0 text-[12px] text-paper-dim hover:text-paper"
        onClick={() => s.setAdvancedOpen(true)}
      >
        Filters
      </button>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 shrink-0 rounded-full px-2.5 text-[11.5px] capitalize ${
        active ? "bg-violet/25 text-paper" : "border border-line text-paper-dim hover:text-paper"
      }`}
    >
      {label}
    </button>
  );
}
