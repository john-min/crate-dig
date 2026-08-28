"use client";

import { formatBpm, formatKey } from "@/lib/studio/format";
import type { StudioTrack } from "@/lib/studio/types";
import { IconPause, IconPlay } from "./icons";

type Props = {
  track: StudioTrack;
  selected?: boolean;
  playing?: boolean;
  focused?: boolean;
  density?: "comfortable" | "compact";
  score?: number | null;
  onSelect: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onPlay: () => void;
  onAdd: () => void;
  onOpen: () => void;
};

const MOOD_COLORS: Record<string, string> = {
  warm: "#E9A63C",
  euphoric: "#8B7BF0",
  dark: "#5A8CE8",
  dreamy: "#A9C64A",
  hypnotic: "#48BFD4",
};

export function TrackRow({
  track,
  selected,
  playing,
  focused,
  onSelect,
  onPlay,
  onAdd,
  onOpen,
}: Props) {
  const missing = track.analysisStatus === "missing-metadata";
  const pending = track.analysisStatus === "pending";
  const failed = track.analysisStatus === "failed";
  const duplicate = track.analysisStatus === "duplicate";
  const vibe = pending ? "needs analysis" : track.tags[0] ?? track.mood;

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${track.title} by ${track.artist}`}
      title={`${track.title} — ${track.artist}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen();
        }
        if (event.key === " ") {
          event.preventDefault();
          onSelect(event);
        }
      }}
      className="grid grid-cols-[28px_minmax(0,1fr)_56px_44px] items-center gap-3 border-b border-[#14171C] px-4 py-2 text-left md:grid-cols-[28px_2.1fr_1.3fr_56px_44px_1fr_74px]"
      style={{ background: selected || focused ? "#111318" : "transparent" }}
    >
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="grid h-[22px] w-[22px] place-items-center rounded-full border border-[#2E3440] text-[8px]"
          style={{ color: playing ? "#E9A63C" : "#98A0AE" }}
          aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
          onClick={onPlay}
        >
          {playing ? <IconPause className="h-2 w-2" /> : <IconPlay className="h-2 w-2" />}
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-[7px]">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: MOOD_COLORS[track.mood] ?? "#5B6373" }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-[12.8px]" style={{ color: selected ? "#FFFFFF" : "#EDEFF3" }}>
            {track.title}
          </p>
          <p className="truncate text-[11.5px] text-[#8B929F] md:hidden">{track.artist}</p>
          {failed ? <p className="text-[12px] text-[#E4705A]">Analysis failed</p> : null}
          {duplicate ? <p className="text-[12px] text-[#E4705A]">Duplicate fingerprint</p> : null}
          {missing ? <p className="text-[12px] text-[#8B929F]">Missing metadata</p> : null}
          {pending ? <p className="text-[12px] text-[#8B929F]">Ready for analysis</p> : null}
        </div>
      </div>
      <p className="hidden truncate text-[12.3px] text-[#A6ACB8] md:block">{track.artist}</p>
      <p className="tabular text-[12px]" style={{ color: track.bpm != null ? "#A6ACB8" : "#5B6373" }}>
        {formatBpm(track.bpm)}
      </p>
      <p className="tabular text-[12px] text-[#8B7BF0]">{formatKey(track.key)}</p>
      <div className="hidden min-w-0 items-center md:flex">
        <span className="max-w-full truncate rounded-full bg-[#171B21] px-[7px] py-0.5 text-[10.5px] text-[#A6ACB8]">
          {vibe}
        </span>
      </div>
      <div className="hidden text-right text-[11.5px] text-[#98A0AE] md:block" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={`Add ${track.title} to crate`} onClick={onAdd}>
          + Crate
        </button>
      </div>
    </div>
  );
}
