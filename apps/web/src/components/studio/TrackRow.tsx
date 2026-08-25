"use client";

import { formatBpm, formatKey } from "@/lib/studio/format";
import type { StudioTrack } from "@/lib/studio/types";
import { IconOverflow, IconPause, IconPlay, IconPlus } from "./icons";

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

export function TrackRow({
  track,
  selected,
  playing,
  focused,
  density = "compact",
  score,
  onSelect,
  onPlay,
  onAdd,
  onOpen,
}: Props) {
  const compact = density !== "comfortable";
  const missing = track.analysisStatus === "missing-metadata";
  const failed = track.analysisStatus === "failed";
  const duplicate = track.analysisStatus === "duplicate";
  const vibe = track.tags[0] ?? track.mood;

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
      className={`group grid grid-cols-[2rem_minmax(0,1fr)_3.25rem_2.75rem_4.5rem_4.5rem] items-center gap-2 px-[var(--pad-panel)] text-left md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_3.25rem_2.75rem_4.5rem_5.5rem] ${
        compact ? "h-[var(--track-row-compact)]" : "h-[var(--track-row-comfortable)]"
      } ${
        selected && playing
          ? "bg-amber/10"
          : playing
            ? "bg-ink-hover"
            : selected
              ? "bg-ink-hover"
              : focused
                ? "bg-[var(--raised)]"
                : "hover:bg-ink-hover"
      }`}
    >
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-paper hover:bg-[var(--control)]"
          aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
          onClick={onPlay}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium leading-[18px] text-paper">{track.title}</p>
        <p className="truncate text-[12px] text-paper-dim md:hidden">{track.artist}</p>
        {failed ? <p className="text-[12px] text-coral">Analysis failed</p> : null}
        {duplicate ? <p className="text-[12px] text-coral">Duplicate fingerprint</p> : null}
        {missing ? <p className="text-[12px] text-paper-dim">Missing metadata</p> : null}
      </div>
      <p className="hidden truncate text-[12px] text-paper-dim md:block">{track.artist}</p>
      <p className="font-data text-[11.5px] text-paper-dim">{formatBpm(track.bpm)}</p>
      <p className="font-data text-[11.5px] text-violet">{formatKey(track.key)}</p>
      <div className="hidden items-center gap-2 md:flex">
        <span className="max-w-[5.5rem] truncate text-[12px] text-paper-dim">{vibe}</span>
        <MatchBar score={score} />
      </div>
      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-paper-dim hover:bg-[var(--control)] hover:text-paper"
          aria-label={`Add ${track.title} to crate`}
          onClick={onAdd}
        >
          <IconPlus />
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-paper-dim hover:bg-[var(--control)] hover:text-paper"
          aria-label={`More actions for ${track.title}`}
          onClick={onOpen}
        >
          <IconOverflow />
        </button>
      </div>
    </div>
  );
}

function MatchBar({ score }: { score?: number | null }) {
  const width = score == null ? 0 : Math.max(8, Math.round(score * 100));
  return (
    <span className="relative h-1 w-10 overflow-hidden rounded-full bg-[var(--control)]" aria-hidden>
      <span className="absolute inset-y-0 left-0 bg-amber" style={{ width: `${width}%` }} />
    </span>
  );
}
