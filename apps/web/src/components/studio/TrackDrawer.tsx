"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatBpm, formatDuration, formatKey } from "@/lib/studio/format";
import { waveformPeaks } from "@/lib/studio/waveform";
import { useStudio } from "./StudioProvider";
import { SimilarityReasonStack } from "./SimilarityReasonStack";
import { Waveform } from "./Waveform";
import { IconClose } from "./icons";
import { nearbyTracks } from "@/lib/studio/similarity";

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
  const neighbors = nearbyTracks(track, s.tracks, 6);
  const similarEmpty = neighbors.length === 0;
  const progress = track.durationSec ? s.playheadSec / track.durationSec : 0;
  const isPlaying = s.playing?.id === track.id && s.playStatus === "playing";
  const unsaved = editing && draftTags.trim() !== track.tags.join(", ");

  return (
    <aside
      role="dialog"
      aria-labelledby={headingId}
      className={
        asSheet
          ? "absolute inset-x-0 bottom-14 z-30 max-h-[70%] overflow-auto rounded-t-2xl border-t border-line bg-ink shadow-[0_-12px_40px_rgba(0,0,0,0.4)]"
          : "flex h-full min-h-0 w-[var(--drawer-width)] max-w-[100vw] shrink-0 flex-col border-l border-line bg-[var(--panel)] transition-[transform,opacity] duration-[var(--duration-panel)] ease-[var(--ease-panel)]"
      }
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">
            {track.label} · {track.year} · {track.genre || "—"}
          </p>
          <h2 id={headingId} className="mt-1 font-serif text-[1.75rem] leading-tight tracking-tight">
            {track.title}
          </h2>
          <p className="mt-1 text-[14px] text-paper-dim">{track.artist}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-paper-dim hover:text-paper"
          aria-label="Close track detail"
          onClick={s.closeDrawer}
        >
          <IconClose />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <dl className="mt-4 grid grid-cols-5 gap-2 text-[12px]">
          <Stat label="BPM" value={formatBpm(track.bpm)} />
          <Stat label="Key" value={formatKey(track.key)} />
          <Stat label="Length" value={formatDuration(track.durationSec)} />
          <Stat
            label="Energy"
            value={track.energyScore != null ? `${Math.round(track.energyScore)} / 10` : "—"}
          />
          <Stat
            label="Loudness"
            value={track.loudnessLufs != null ? `${track.loudnessLufs.toFixed(1)} LUFS` : "—"}
          />
        </dl>

        <div className="mt-4">
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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {track.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-2 py-0.5 text-[12px] text-paper-dim">
              {tag}
            </span>
          ))}
          <button
            type="button"
            className="text-[12px] text-paper-dim hover:text-paper"
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
            <label className="text-[12px] text-paper-dim" htmlFor="crate-tags">
              Crate Dig tags — not written back to the audio file
            </label>
            <input
              id="crate-tags"
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-line bg-ink-raised px-2 text-[13px]"
            />
            {unsaved ? <p className="mt-1 text-[12px] text-amber">Unsaved tag edits</p> : null}
          </div>
        ) : null}

        {s.seed && s.seed.id !== track.id ? (
          <div className="mt-5">
            <SimilarityReasonStack reasons={s.reasonsFor(track)} score={s.scoreFor(track)} />
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-[14px] font-medium">Works well with</h3>
          {similarEmpty ? (
            <p className="mt-2 text-[13px] text-paper-dim">
              No confident neighbors yet. Analyze more records or widen filters.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {neighbors.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-ink-hover"
                    onClick={() => s.openDrawer(n.id)}
                  >
                    <span className="min-w-0 truncate text-[13px]">
                      {n.title}
                      <span className="text-paper-dim"> · {n.artist}</span>
                    </span>
                    <span className="tabular shrink-0 text-[12px] text-muted">
                      {formatBpm(n.bpm)} · {formatKey(n.key)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <button
          type="button"
          className="h-9 rounded-full bg-amber px-4 text-[13px] font-medium text-ink hover:bg-amber/90"
          onClick={() => (isPlaying ? s.pause() : s.play(track.id))}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-line px-3 text-[13px] hover:border-amber/40"
          onClick={() => s.addToCrate(track.id)}
        >
          Add to crate
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-line px-3 text-[13px] hover:border-amber/40"
          onClick={() => s.setSeed(track.id)}
        >
          Find similar
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-line px-3 text-[13px] hover:border-amber/40"
          onClick={() => s.askQ(`What works after ${track.title}?`)}
        >
          Ask Q
        </button>
        {confirmHide ? (
          <div className="flex w-full items-center gap-2 text-[12px] text-paper-dim">
            Hide from recommendations? It stays in the library.
            <button type="button" className="text-amber" onClick={() => { s.hideFromRecs(track.id); setConfirmHide(false); }}>
              Hide
            </button>
            <button type="button" onClick={() => setConfirmHide(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="h-9 rounded-full border border-line px-3 text-[13px] hover:border-amber/40"
            onClick={() => setConfirmHide(true)}
          >
            Hide from recommendations
          </button>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-[13px] text-paper">{value}</dd>
    </div>
  );
}
