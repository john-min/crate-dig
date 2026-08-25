"use client";

import { formatBpm, formatDuration, formatKey } from "@/lib/studio/format";
import { waveformPeaks } from "@/lib/studio/waveform";
import { useStudio } from "./StudioProvider";
import { Waveform } from "./Waveform";
import { IconPause, IconPlay, IconPlus } from "./icons";

export function AudioPlayer() {
  const s = useStudio();
  const track = s.playing ?? s.primarySelected;
  const status = s.playStatus;
  const canPlay = Boolean(track);
  const isPlaying = status === "playing";
  const failed = status === "failed";
  const loading = status === "loading" || status === "buffering";
  const peaks = track ? waveformPeaks(track.id, 80) : [];
  const progress = track && track.durationSec ? s.playheadSec / track.durationSec : 0;

  let statusCopy = "Audition from the map or list";
  if (!track) statusCopy = "No track loaded";
  else if (loading) statusCopy = "Loading preview";
  else if (failed && track.previewState === "missing") statusCopy = "Missing local file";
  else if (failed && track.previewState === "expired") statusCopy = "Signed URL expired";
  else if (failed) statusCopy = "Playback failed";
  else if (isPlaying) statusCopy = "Playing";
  else if (status === "paused") statusCopy = "Paused";

  return (
    <div className="flex h-[var(--player-height)] items-center gap-3 border-t border-line bg-[var(--panel)] px-3 md:px-4">
      <div
        className="h-11 w-11 shrink-0 rounded-[var(--radius-md)] border border-line bg-[var(--control)]"
        aria-hidden
      />
      <div className="min-w-0 w-44 shrink">
        <p className="truncate text-[13px] font-medium text-paper">
          {track?.title ?? "No track loaded"}
        </p>
        <p className="truncate text-[12px] text-paper-dim">
          {track ? track.artist : statusCopy}
        </p>
      </div>
      <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
        <span className="font-data w-10 text-[11.5px] text-muted">{formatDuration(s.playheadSec)}</span>
        <div className="min-w-0 flex-1">
          {track && peaks.length ? (
            <button
              type="button"
              className="block w-full"
              aria-label="Seek"
              onClick={(e) => {
                if (!track) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                s.seek(ratio * track.durationSec);
              }}
            >
              <Waveform peaks={peaks} progress={progress} className="h-7" label="Playback position" />
            </button>
          ) : (
            <div className="h-px bg-[var(--hairline)]" />
          )}
        </div>
        <span className="font-data w-10 text-[11.5px] text-muted">
          {formatDuration(track?.durationSec)}
        </span>
      </div>
      <p className="hidden font-data text-[11.5px] text-paper-dim lg:block">
        {track ? `${formatBpm(track.bpm)} BPM · ${formatKey(track.key)}` : ""}
      </p>
      {track ? (
        <button
          type="button"
          className="hidden h-8 items-center rounded-[var(--radius-md)] border border-line px-2.5 text-[12px] text-paper-dim hover:text-paper sm:inline-flex"
          onClick={() => s.addToCrate(track.id)}
        >
          <IconPlus className="mr-1 h-3 w-3" />
          Crate
        </button>
      ) : null}
      <button
        type="button"
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-[var(--text-on-accent-dark)] hover:bg-paper/90 disabled:bg-[var(--control)] disabled:text-[var(--text-disabled)]"
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!canPlay || failed}
        onClick={() => (isPlaying ? s.pause() : s.play(track?.id))}
      >
        {isPlaying ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
      </button>
      <span className="sr-only">{statusCopy}</span>
    </div>
  );
}
