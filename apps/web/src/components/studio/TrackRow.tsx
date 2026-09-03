"use client";

import { TRACK_ROW_HEIGHT } from "@/lib/studio/constants";
import { formatBpm, formatGenre, formatKey } from "@/lib/studio/format";
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

function statusLabel(track: StudioTrack): string | null {
  if (track.analysisStatus === "failed") return "Analysis failed";
  if (track.analysisStatus === "duplicate") return "Duplicate fingerprint";
  if (track.analysisStatus === "missing-metadata") return "Missing metadata";
  if (track.analysisStatus === "pending") return "Ready for analysis";
  return null;
}

export function TrackRow({
  track,
  selected,
  playing,
  focused,
  density = "compact",
  onSelect,
  onPlay,
  onAdd,
  onOpen,
}: Props) {
  const pending = track.analysisStatus === "pending";
  const failed = track.analysisStatus === "failed";
  const genre = formatGenre(track.genre);
  const vibe = pending ? "needs analysis" : track.mood;
  const status = statusLabel(track);
  const titleColor = failed ? "#E4705A" : selected ? "#FFFFFF" : "#EDEFF3";
  const height = TRACK_ROW_HEIGHT[density];

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${track.title} by ${track.artist}${status ? `, ${status}` : ""}`}
      title={`${track.title} — ${track.artist}${status ? ` · ${status}` : ""}`}
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
      className="grid h-[var(--track-row-height)] grid-cols-[28px_minmax(0,1fr)_56px_44px] items-center gap-3 overflow-hidden border-b border-[#14171C] px-4 text-left min-[900px]:grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1fr)_52px_40px_minmax(5.75rem,0.95fr)_minmax(4.75rem,0.7fr)_64px] min-[900px]:gap-2.5"
      style={{
        background: selected || focused ? "#111318" : "transparent",
        ["--track-row-height" as string]: `${height}px`,
      }}
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
        <div className="min-w-0 overflow-hidden">
          <p className="truncate text-[12.8px] leading-4" style={{ color: titleColor }}>
            {track.title}
          </p>
          <p className="truncate text-[11px] leading-3.5 text-[#8B929F] min-[900px]:hidden">
            {status ?? `${track.artist} · ${genre} · ${vibe}`}
          </p>
        </div>
      </div>
      <p className="hidden truncate text-[12.3px] text-[#A6ACB8] min-[900px]:block">{track.artist}</p>
      <p className="tabular text-[12px]" style={{ color: track.bpm != null ? "#A6ACB8" : "#5B6373" }}>
        {formatBpm(track.bpm)}
      </p>
      <p className="tabular text-[12px] text-[#8B7BF0]">{formatKey(track.key)}</p>
      <p className="hidden truncate text-[12.3px] text-[#A6ACB8] min-[900px]:block">{genre}</p>
      <div className="hidden min-w-0 items-center min-[900px]:flex">
        <span className="max-w-full truncate rounded-full bg-[#171B21] px-[7px] py-0.5 text-[10.5px] capitalize text-[#A6ACB8]">
          {status ?? vibe}
        </span>
      </div>
      <div className="hidden text-right text-[11.5px] text-[#98A0AE] min-[900px]:block" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={`Add ${track.title} to crate`} onClick={onAdd}>
          + Crate
        </button>
      </div>
    </div>
  );
}
