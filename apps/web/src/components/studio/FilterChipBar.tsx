"use client";

import { useStudio } from "./StudioProvider";

export function FilterChipBar() {
  const s = useStudio();
  const { filters } = s;
  const bpmActive = filters.bpmMin > s.bpmBounds.min || filters.bpmMax < s.bpmBounds.max;
  const bpmLabel = `${Math.round(filters.bpmMin)}–${Math.round(filters.bpmMax)}`;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-[#1B1F27] px-3 py-2">
      {filters.moods.map((mood) => (
        <Chip
          key={mood}
          label={mood}
          active
          onClick={() => s.setFilters({ ...filters, moods: filters.moods.filter((item) => item !== mood) })}
        />
      ))}
      {filters.energies.map((energy) => (
        <Chip
          key={energy}
          label={energy}
          active
          onClick={() =>
            s.setFilters({ ...filters, energies: filters.energies.filter((item) => item !== energy) })
          }
        />
      ))}
      {filters.keys.map((key) => (
        <Chip
          key={key}
          label={key}
          active
          onClick={() => s.setFilters({ ...filters, keys: filters.keys.filter((item) => item !== key) })}
        />
      ))}
      <Chip label={bpmLabel} active={bpmActive} onClick={() => s.setAdvancedOpen(true)} />
      <button
        type="button"
        className="ml-auto shrink-0 text-[12px] text-[#98A0AE] hover:text-[#EDEFF3]"
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
        active ? "bg-[#241C3D] text-[#C4B6F5]" : "border border-[#262B34] text-[#98A0AE] hover:text-[#EDEFF3]"
      }`}
    >
      {label}
    </button>
  );
}
