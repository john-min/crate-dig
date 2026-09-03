"use client";

import { formatBpm, formatDuration, formatKey } from "@/lib/studio/format";
import { waveformPeaks } from "@/lib/studio/waveform";
import { MOOD_COLORS } from "@/lib/studio/constants";
import { useStudio } from "./StudioProvider";
import { IconPause, IconPlay, IconSkipBack, IconSkipForward } from "./icons";

export function AudioPlayer() {
  const s = useStudio();
  const track = s.playing ?? s.primarySelected;
  const status = s.playStatus;
  const canPlay = Boolean(track);
  const isPlaying = status === "playing" || status === "buffering";
  const failed = status === "failed";
  const loading = status === "loading";
  const duration = track && track.durationSec > 1 ? track.durationSec : Math.max(s.playheadSec, 0);
  const progress = duration > 0 ? Math.min(1, s.playheadSec / duration) : 0;
  const mood = track ? (MOOD_COLORS[track.mood] ?? "#E9A63C") : "#5B6373";
  const peaks = track ? waveformPeaks(track.id, 90) : [];

  let statusCopy = "Audition from the map or list";
  if (!track) statusCopy = "No track loaded";
  else if (loading) statusCopy = "Loading preview";
  else if (failed && track.previewState === "missing") {
    statusCopy = s.librarySource === "preview" ? "No R2 object" : "Missing local file";
  } else if (failed && track.previewState === "expired") statusCopy = "Signed URL expired";
  else if (failed) statusCopy = "Playback failed";
  else if (isPlaying) statusCopy = "Playing";
  else if (status === "paused") statusCopy = "Paused";

  const subtitle = track
    ? [track.artist, track.label].filter((value) => value && value.trim()).join(" · ")
    : statusCopy;

  return (
    <div className="relative z-30 h-[78px] shrink-0 border-t border-[#1B1F27] bg-[#0C0E12]">
      <div className="flex h-full items-center gap-4 px-4 md:gap-5 md:px-5">
        <div className="flex min-w-0 max-w-[220px] items-center gap-3 md:max-w-[280px]">
          <div
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-[#262B34] bg-gradient-to-br from-[#1E2229] to-[#111318] md:h-[42px] md:w-[42px]"
            aria-hidden
          >
            <div
              className="h-[18px] w-[18px] rounded-full border-[1.5px]"
              style={{
                borderColor: mood,
                borderRightColor: isPlaying ? "transparent" : mood,
                animation: isPlaying ? "cdSpin 1.2s linear infinite" : undefined,
              }}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-[#EDEFF3] md:text-[14px]">
              {track?.title ?? "No track loaded"}
            </p>
            <p className="mt-0.5 truncate text-[12px] leading-tight text-[#8B929F]">{subtitle}</p>
          </div>
        </div>

        <Transport
          canPlay={canPlay}
          canPrevious={s.canPlayPrevious}
          canNext={s.canPlayNext}
          isPlaying={isPlaying}
          onPrevious={s.playPrevious}
          onPlay={() => (isPlaying ? s.pause() : s.play(track?.id))}
          onNext={s.playNext}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="w-9 shrink-0 tabular text-[12px] text-[#8B929F]">
            {formatDuration(s.playheadSec)}
          </span>
          {track && peaks.length ? (
            <button
              type="button"
              className="flex h-7 min-w-0 flex-1 items-center gap-[1.5px]"
              aria-label="Seek"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / rect.width;
                s.seek(ratio * duration);
              }}
            >
              {peaks.map((peak, index) => (
                <span
                  key={index}
                  className="min-w-0 flex-1 rounded-px"
                  style={{
                    height: `${Math.max(8, Math.round(peak * 100))}%`,
                    background: index / peaks.length < progress ? "#E9A63C" : "#2E3440",
                  }}
                />
              ))}
            </button>
          ) : (
            <div className="h-px min-w-0 flex-1 bg-[#1B1F27]" />
          )}
          <span className="w-9 shrink-0 text-right tabular text-[12px] text-[#8B929F]">
            {duration > 1 ? formatDuration(duration) : "0:00"}
          </span>
        </div>

        {track ? (
          <div className="hidden shrink-0 items-center gap-3 text-[12px] md:flex">
            <span
              className="tabular"
              style={{ color: track.bpm != null ? "#A6ACB8" : "#5B6373" }}
            >
              {track.bpm != null ? `${formatBpm(track.bpm)} BPM` : "— BPM"}
            </span>
            <span className="tabular text-[#8B7BF0]">
              {track.key ? `${formatKey(track.key)} KEY` : "— KEY"}
            </span>
          </div>
        ) : null}
      </div>
      <span className="sr-only">{statusCopy}</span>
    </div>
  );
}

function Transport({
  canPlay,
  canPrevious,
  canNext,
  isPlaying,
  onPrevious,
  onPlay,
  onNext,
}: {
  canPlay: boolean;
  canPrevious: boolean;
  canNext: boolean;
  isPlaying: boolean;
  onPrevious: () => void;
  onPlay: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 md:gap-4">
      <button
        type="button"
        className="grid h-9 w-9 place-items-center text-[#8B929F] hover:text-[#EDEFF3] disabled:text-[#3A4150] disabled:hover:text-[#3A4150]"
        aria-label="Previous track"
        disabled={!canPrevious}
        onClick={onPrevious}
      >
        <IconSkipBack className="h-5 w-5" />
      </button>
      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-full bg-[#EDEFF3] text-[#0B0D10] disabled:bg-[#20242C] disabled:text-[#5B6373] md:h-11 md:w-11"
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!canPlay}
        onClick={onPlay}
      >
        {isPlaying ? (
          <IconPause className="h-3.5 w-3.5" />
        ) : (
          <IconPlay className="h-3.5 w-3.5 translate-x-[1px]" />
        )}
      </button>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center text-[#8B929F] hover:text-[#EDEFF3] disabled:text-[#3A4150] disabled:hover:text-[#3A4150]"
        aria-label="Next track"
        disabled={!canNext}
        onClick={onNext}
      >
        <IconSkipForward className="h-5 w-5" />
      </button>
    </div>
  );
}
