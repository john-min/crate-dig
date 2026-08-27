"use client";

import { formatBpm, formatKey, formatScore } from "@/lib/studio/format";
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

const MOOD_COLORS: Record<string, string> = {
  warm: "var(--amber)",
  euphoric: "var(--violet)",
  dark: "var(--blue)",
  dreamy: "var(--lime)",
  hypnotic: "var(--cyan)",
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
      className={`group grid grid-cols-[30px_minmax(0,1fr)_54px_42px_68px] items-center gap-2 border-t border-[var(--hairline)] px-[var(--pad-panel)] text-left md:grid-cols-[30px_minmax(0,3fr)_minmax(0,1.8fr)_54px_42px_minmax(0,1.4fr)_96px_68px] ${
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
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: MOOD_COLORS[track.mood] ?? "var(--muted)" }}
            aria-hidden
          />
          <p className="truncate text-[12.75px] font-medium leading-[17px] text-paper">{track.title}</p>
        </div>
        <p className="truncate text-[11.5px] text-paper-dim md:hidden">{track.artist}</p>
        {failed ? <p className="text-[12px] text-coral">Analysis failed</p> : null}
        {duplicate ? <p className="text-[12px] text-coral">Duplicate fingerprint</p> : null}
        {missing ? <p className="text-[12px] text-paper-dim">Missing metadata</p> : null}
        {pending ? <p className="text-[12px] text-paper-dim">Ready for analysis</p> : null}
      </div>
      <p className="hidden truncate text-[12.25px] text-paper-dim md:block">{track.artist}</p>
      <p className="tabular text-[12px] text-paper-dim">{formatBpm(track.bpm)}</p>
      <p className="tabular text-[12px] text-violet">{formatKey(track.key)}</p>
      <div className="hidden min-w-0 items-center md:flex">
        <span className="max-w-full truncate rounded-full bg-[var(--control)] px-2 py-0.5 text-[11px] text-paper-dim">
          {vibe}
        </span>
      </div>
      <MatchBar score={score} />
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
    <span className="hidden items-center gap-2 md:flex">
      <span className="relative h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--control)]" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-amber" style={{ width: `${width}%` }} />
      </span>
      <span className="tabular w-8 text-right text-[11.5px] text-muted">{formatScore(score)}</span>
    </span>
  );
}
