"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clusterRgb } from "@/components/map/colors";
import { formatBpm, formatDuration, formatKey, formatScore } from "@/lib/studio/format";
import { neighbourhoodFor } from "@/lib/studio/neighbourhood";
import { energyCurvePeaks, waveformPeaks } from "@/lib/studio/waveform";
import type { StudioTrack } from "@/lib/studio/types";
import { useStudio } from "./StudioProvider";
import { EnergyCurve, Waveform } from "./Waveform";
import { IconClose, IconPlay } from "./icons";

export function TrackDrawer({ asSheet = false }: { asSheet?: boolean }) {
  const s = useStudio();
  const track = s.primarySelected;
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmHide, setConfirmHide] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTags, setDraftTags] = useState("");

  useEffect(() => {
    closeRef.current?.focus();
  }, [track?.id]);

  if (!s.drawerOpen || !track) return null;

  const peaks = waveformPeaks(track.id);
  const curve = energyCurvePeaks(track.id, track.energyScore);
  const neighbors = s.seed
    ? s.candidates.filter((candidate) => candidate.id !== track.id && s.scoreFor(candidate) != null).slice(0, 6)
    : s.candidates.filter((candidate) => candidate.id !== track.id && candidate.cluster === track.cluster).slice(0, 6);
  const similarEmpty = neighbors.length === 0;
  const progress = track.durationSec ? s.playheadSec / track.durationSec : 0;
  const isPlaying = s.playing?.id === track.id && s.playStatus === "playing";
  const unsaved = editing && draftTags.trim() !== track.tags.join(", ");
  const place = neighbourhoodFor(track, s.tracks);
  const swatch = clusterRgb(track.cluster);
  const meta = [track.label, track.year || null, track.genre || null]
    .filter((bit) => bit != null && String(bit).trim() !== "" && bit !== 0)
    .join(" · ");

  return (
    <aside
      role="dialog"
      aria-labelledby={headingId}
      className={
        asSheet
          ? "absolute inset-x-0 bottom-14 z-30 max-h-[78%] overflow-auto rounded-t-2xl border-t border-[#1B1F27] bg-[#0C0E12] shadow-[0_-12px_40px_rgba(0,0,0,0.4)]"
          : "pointer-events-auto absolute right-5 top-5 z-30 flex w-[min(28.5rem,calc(100%-2.5rem))] max-h-[calc(100%-2.5rem)] flex-col overflow-hidden rounded-[18px] border border-[#1B1F27] bg-[#0C0E12]/95 shadow-[0_28px_80px_rgba(0,0,0,0.58)]"
      }
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {meta ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8B929F]">{meta}</p>
          ) : null}
          <h2 id={headingId} className="mt-1.5 font-serif text-[2rem] leading-[1.05] tracking-tight text-[#F4F5F7]">
            {track.title}
          </h2>
          <p className="mt-1.5 text-[15px] text-[#B7BEC9]">{track.artist}</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 h-10 w-10 rounded-[8px]"
            style={{
              background: `radial-gradient(circle at 35% 30%, rgba(${swatch.join(",")},0.95), rgba(${swatch.join(",")},0.28))`,
            }}
          />
          <button
            ref={closeRef}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#8B929F] hover:text-[#EDEFF3]"
            aria-label="Close track detail"
            onClick={s.closeDrawer}
          >
            <IconClose />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <dl className="mt-5 grid grid-cols-5 gap-3 text-[11px] uppercase tracking-[0.08em] text-[#7C8698]">
          <Stat label="BPM" value={formatBpm(track.bpm)} />
          <Stat label="Key" value={formatKey(track.key)} accent="#8B7BF0" />
          <Stat label="Length" value={formatDuration(track.durationSec)} />
          <Stat
            label="Energy"
            value={track.energyScore != null ? `${Math.round(track.energyScore)} / 10` : "—"}
            accent="#E9A63C"
          />
          <Stat
            label="Loudness"
            value={track.loudnessLufs != null ? `${track.loudnessLufs.toFixed(1)} LUFS` : "—"}
          />
        </dl>

        <div className="mt-5">
          {track.previewState === "failed" ? (
            <p className="text-[13px] text-amber">Waveform preview failed. Playback chrome still works.</p>
          ) : (
            <Waveform
              peaks={peaks}
              progress={isPlaying ? progress : 0}
              label={`Waveform for ${track.title}`}
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {track.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#262B34] bg-[#12151B] px-2.5 py-[3px] text-[12px] capitalize text-[#C4CAD4]"
            >
              {tag}
            </span>
          ))}
          <button
            type="button"
            className="rounded-full border border-[#262B34] px-2.5 py-[3px] text-[12px] text-[#8B929F] hover:text-[#EDEFF3]"
            onClick={() => {
              setEditing(true);
              setDraftTags(track.tags.join(", "));
            }}
          >
            Edit tags
          </button>
        </div>
        {editing ? (
          <div className="mt-2">
            <label className="text-[12px] text-[#8B929F]" htmlFor="crate-tags">
              Crate Dig tags — not written back to the audio file
            </label>
            <input
              id="crate-tags"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[#262B34] bg-[#12151B] px-2 text-[13px]"
            />
            {unsaved ? <p className="mt-1 text-[12px] text-amber">Unsaved tag edits</p> : null}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7C8698]">Energy curve</p>
            <EnergyCurve peaks={curve} className="mt-2" />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-[0.08em] text-[#5B6373]">
              <span>intro</span>
              <span>break</span>
              <span>outro</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7C8698]">Neighbourhood</p>
            <p className="mt-2 text-[13px] leading-[1.45] text-[#C4CAD4]">
              Sits {place.lean ? "on the edge of" : "in"}{" "}
              <span className="text-[#E9A63C]">{place.home}</span>
              {place.lean ? (
                <>
                  {", leaning toward "}
                  <span className="text-[#E9A63C]">{place.lean}</span>
                </>
              ) : null}
              {`. Shares this island with ${place.shared.toLocaleString()} records in view.`}
            </p>
            <button
              type="button"
              className="mt-3 text-[13px] text-[#8B7BF0] hover:text-[#EDEFF3]"
              onClick={() => s.askQ(`Why is ${track.title} grouped with ${place.home}?`)}
            >
              Explain this cluster →
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-medium text-[#EDEFF3]">Works well with</h3>
            <button
              type="button"
              className="text-[12.5px] text-[#8B7BF0] hover:text-[#EDEFF3]"
              onClick={() => s.setSeed(track.id)}
            >
              Find similar
            </button>
          </div>
          {similarEmpty ? (
            <p className="mt-2 text-[13px] text-[#8B929F]">
              No confident neighbors yet. Analyze more records or widen filters.
            </p>
          ) : (
            <ul className="mt-2">
              {neighbors.map((n) => (
                <NeighborRow
                  key={n.id}
                  track={n}
                  source={track}
                  score={s.scoreFor(n)}
                  onPlay={() => s.play(n.id)}
                  onOpen={() => s.openDrawer(n.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#1B1F27] px-5 py-3">
        <button
          type="button"
          className="h-9 rounded-full bg-[#E9A63C] px-4 text-[13px] font-medium text-[#181203] hover:bg-[#E9A63C]/90"
          onClick={() => (isPlaying ? s.pause() : s.play(track.id))}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-[#2A2F39] px-3 text-[13px] text-[#EDEFF3] hover:border-[#E9A63C]/40"
          onClick={() => s.addToCrate(track.id)}
        >
          Add to crate
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-[#2A2F39] px-3 text-[13px] text-[#EDEFF3] hover:border-[#E9A63C]/40"
          onClick={() => s.setSeed(track.id)}
        >
          Find similar
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-[#2A2F39] px-3 text-[13px] text-[#8B7BF0] hover:border-[#8B7BF0]/50"
          onClick={() => s.askQ(`What works after ${track.title}?`)}
        >
          Ask Q
        </button>
        <div className="ml-auto flex items-center gap-3">
          {confirmHide ? (
            <div className="flex items-center gap-2 text-[12px] text-[#8B929F]">
              Hide from recommendations?
              <button type="button" className="text-[#E9A63C]" onClick={() => { s.hideFromRecs(track.id); setConfirmHide(false); }}>
                Hide
              </button>
              <button type="button" onClick={() => setConfirmHide(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-[13px] text-[#8B929F] hover:text-[#EDEFF3]"
              onClick={() => setConfirmHide(true)}
            >
              Hide
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function NeighborRow({
  track,
  source,
  score,
  onPlay,
  onOpen,
}: {
  track: StudioTrack;
  source: StudioTrack;
  score: number | null;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const shared = track.textures.find((texture) => source.textures.includes(texture));
  const note = shared ? `shares ${shared}` : track.cluster === source.cluster ? "same island" : "nearby";
  return (
    <li className="flex items-center gap-2 border-b border-[#161A20] py-2 last:border-b-0">
      <button
        type="button"
        className="grid h-7 w-7 shrink-0 place-items-center text-[#8B929F] hover:text-[#EDEFF3]"
        aria-label={`Play ${track.title}`}
        onClick={onPlay}
      >
        <IconPlay />
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="truncate text-[13px] text-[#EDEFF3]">{track.title}</p>
        <p className="truncate text-[11.5px] text-[#7C8698]">
          {track.artist} · {note} · {track.mood}
        </p>
      </button>
      <span className="shrink-0 tabular text-[12px] text-[#C4CAD4]">{formatBpm(track.bpm)}</span>
      <span className="w-8 shrink-0 tabular text-right text-[12px] text-[#8B7BF0]">{formatKey(track.key)}</span>
      <span className="w-9 shrink-0 tabular text-right text-[12px] text-[#E9A63C]">{formatScore(score)}</span>
    </li>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mt-1 text-[15px] font-medium normal-case tracking-normal" style={{ color: accent ?? "#EDEFF3" }}>
        {value}
      </dd>
    </div>
  );
}
