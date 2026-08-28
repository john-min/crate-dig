"use client";

import { camelotNeighbors } from "@/lib/studio/format";

const ROW_A = Array.from({ length: 12 }, (_, i) => `${i + 1}A`);
const ROW_B = Array.from({ length: 12 }, (_, i) => `${i + 1}B`);

type Props = {
  selected: string[];
  onToggle: (key: string) => void;
  onClear: () => void;
};

function cellStyle(key: string, selected: string[]) {
  const on = selected.includes(key);
  const neighbors = new Set(selected.flatMap((item) => camelotNeighbors(item)));
  const compatible = !on && neighbors.has(key);
  return {
    border: on ? "#8B7BF0" : compatible ? "#3A3350" : "#262B34",
    background: on ? "#241C3D" : compatible ? "#171226" : "#0F1116",
    color: on ? "#C4B6F5" : compatible ? "#9B8DD6" : "#98A0AE",
  };
}

export function CamelotMatrix({ selected, onToggle, onClear }: Props) {
  const primary = selected[0];
  const neighbors = primary ? camelotNeighbors(primary) : [];
  const hint = primary
    ? `Compatible with ${primary}: ${neighbors[0]}, ${neighbors[1]} (adjacent tempo-safe), ${neighbors[2]} (relative major/minor).`
    : "Select a key to see its mixing neighborhood.";

  return (
    <div>
      <div className="flex items-center justify-between px-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">
          Key — Camelot
        </span>
        <button
          type="button"
          className="bg-transparent text-[11.5px] text-[#E9A63C]"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="mt-2.5 px-2.5">
        <div className="grid grid-cols-6 gap-[3px]">
          {ROW_A.map((key) => (
            <KeyCell key={key} token={key} selected={selected} onToggle={onToggle} />
          ))}
        </div>
        <div className="mt-[3px] grid grid-cols-6 gap-[3px]">
          {ROW_B.map((key) => (
            <KeyCell key={key} token={key} selected={selected} onToggle={onToggle} />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-[1.5] text-[#6B7383]">{hint}</p>
      </div>
    </div>
  );
}

function KeyCell({
  token,
  selected,
  onToggle,
}: {
  token: string;
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const style = cellStyle(token, selected);
  return (
    <button
      type="button"
      title={token}
      aria-pressed={selected.includes(token)}
      onClick={() => onToggle(token)}
      className="h-[22px] min-w-0 rounded-[5px] p-0 text-[9.5px]"
      style={{ border: `1px solid ${style.border}`, background: style.background, color: style.color }}
    >
      {token}
    </button>
  );
}
