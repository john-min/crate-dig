"use client";

import { formatBpm, formatKey } from "@/lib/studio/format";
import { waveformPeaks } from "@/lib/studio/waveform";
import { MOOD_COLORS } from "@/lib/studio/constants";
import { useStudio } from "./StudioProvider";
import { IconPause, IconPlay } from "./icons";

export function AudioPlayer() {
  const s = useStudio();
  const track = s.playing ?? s.primarySelected;
  const status = s.playStatus;
  const canPlay = Boolean(track);
  const isPlaying = status === "playing";
  const failed = status === "failed";
  const loading = status === "loading" || status === "buffering";
  const peaks = track ? waveformPeaks(track.id, 90) : [];
  const progress = track && track.durationSec ? s.playheadSec / track.durationSec : 0;
  const mood = track ? (MOOD_COLORS[track.mood] ?? "#E9A63C") : "#5B6373";

  let statusCopy = "Audition from the map or list";
  if (!track) statusCopy = "No track loaded";
  else if (loading) statusCopy = "Loading preview";
  else if (failed && track.previewState === "missing") {
    statusCopy = s.librarySource === "preview" ? "No R2 object" : "Missing local file";
  } else if (failed && track.previewState === "expired") statusCopy = "Signed URL expired";
  else if (failed) statusCopy = "Playback failed";
  else if (isPlaying) statusCopy = "Playing";
  else if (status === "paused") statusCopy = "Paused";

  return (
    <div
      className="relative z-30 grid h-[78px] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[#1B1F27] bg-[#0C0E12] px-3 md:grid-cols-[280px_minmax(0,1fr)_240px] md:gap-[18px] md:px-[18px]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border border-[#262B34] bg-gradient-to-br from-[#1E2229] to-[#111318] md:h-[42px] md:w-[42px] md:rounded-[7px]"
          aria-hidden
        >
          <div
            className="h-3.5 w-3.5 rounded-full border md:h-3.5 md:w-3.5"
            style={{
              borderColor: mood,
              animation: isPlaying ? "cdSpin 4s linear infinite" : undefined,
            }}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold md:text-[12.8px]">
            {track?.title ?? "No track loaded"}
          </p>
          <p className="truncate text-[10px] text-[#7C8698] md:text-[11.5px] md:text-[#8B929F]">
            {track ? track.artist : statusCopy}
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 items-center gap-3 md:flex">
        <button
          type="button"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#EDEFF3] text-[#0B0D10] disabled:bg-[#20242C] disabled:text-[#5B6373]"
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!canPlay || failed}
          onClick={() => (isPlaying ? s.pause() : s.play(track?.id))}
        >
          {isPlaying ? <IconPause className="h-2.5 w-2.5" /> : <IconPlay className="h-2.5 w-2.5" />}
        </button>
        {track && peaks.length ? (
          <button
            type="button"
            className="flex h-7 min-w-0 flex-1 items-center gap-[1.5px]"
            aria-label="Seek"
            onClick={(event) => {
              if (!track) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              s.seek(ratio * track.durationSec);
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
      </div>

      <div className="hidden justify-end gap-3 text-[12px] text-[#B7BEC9] md:flex">
        {track ? (
          <>
            <span style={{ color: track.bpm != null ? "#A6ACB8" : "#5B6373" }}>{formatBpm(track.bpm)}</span>
            <span className="text-[#8B7BF0]">{formatKey(track.key)}</span>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#EDEFF3] text-[#0B0D10] disabled:bg-[#20242C] disabled:text-[#5B6373] md:hidden"
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!canPlay || failed}
        onClick={() => (isPlaying ? s.pause() : s.play(track?.id))}
      >
        {isPlaying ? <IconPause className="h-2 w-2" /> : <IconPlay className="h-2 w-2" />}
      </button>
      <span className="sr-only">{statusCopy}</span>
    </div>
  );
}
