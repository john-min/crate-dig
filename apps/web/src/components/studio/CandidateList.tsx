"use client";

import { useRef, useState } from "react";
import { useStudio } from "./StudioProvider";
import { TrackRow } from "./TrackRow";

export function CandidateList() {
  const s = useStudio();
  const rowH = s.density === "compact" ? 38 : 40;
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(280);

  const items = s.candidates;
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 4);
  const visibleCount = Math.ceil(height / rowH) + 8;
  const slice = items.slice(start, start + visibleCount);
  const top = start * rowH;

  const header = s.seed
    ? `Near selected · ${items.length} candidates`
    : `Records in view · ${items.length}`;

  const onRef = (el: HTMLDivElement | null) => {
    scroller.current = el;
    if (el) setHeight(el.clientHeight);
  };

  const playingId = s.playing?.id;

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden border-t border-line bg-ink"
      aria-label="Candidate tracks"
    >
      <div className="flex h-9 shrink-0 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-[12.5px] font-semibold text-paper">{header}</h2>
          {!s.analysisReady ? (
            <a href="/analysis" className="shrink-0 text-[11.5px] font-medium text-amber hover:text-paper">
              Run analysis
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-[11.5px] text-paper-dim hover:text-paper"
            aria-pressed={s.density === "compact"}
            onClick={() => s.setDensity(s.density === "compact" ? "comfortable" : "compact")}
          >
            {s.density === "compact" ? "Comfortable rows" : "Compact rows"}
          </button>
        </div>
      </div>
      <div
        role="rowgroup"
        className="hidden h-7 shrink-0 items-center px-[var(--pad-panel)] text-[11px] font-semibold tracking-[0.06em] text-muted uppercase md:grid md:grid-cols-[30px_minmax(0,3fr)_minmax(0,1.8fr)_54px_42px_minmax(0,1.4fr)_96px_68px] md:gap-2"
      >
        <span />
        <span>Title</span>
        <span>Artist</span>
        <span>BPM</span>
        <span>Key</span>
        <span>Vibe</span>
        <span>Match</span>
        <span />
      </div>
      <div
        ref={onRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: items.length * rowH, position: "relative" }}>
          <div style={{ transform: `translateY(${top}px)` }}>
            {slice.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                density={s.density}
                selected={s.selectedIds.includes(track.id)}
                playing={playingId === track.id && s.playStatus === "playing"}
                focused={s.focusedId === track.id}
                score={s.scoreFor(track)}
                onSelect={(event) => {
                  const additive = "metaKey" in event && (event.metaKey || event.ctrlKey);
                  const range = "shiftKey" in event && event.shiftKey;
                  s.selectTrack(track.id, { additive, range });
                }}
                onPlay={() => {
                  if (playingId === track.id && s.playStatus === "playing") s.pause();
                  else s.play(track.id);
                }}
                onAdd={() => s.addToCrate(track.id)}
                onOpen={() => s.openDrawer(track.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
