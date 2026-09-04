"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { TRACK_ROW_HEIGHT } from "@/lib/studio/constants";
import { useStudio } from "./StudioProvider";
import { TrackRow } from "./TrackRow";

export function CandidateList({ embedded = false }: { embedded?: boolean } = {}) {
  const s = useStudio();
  const rowH = TRACK_ROW_HEIGHT[s.density];
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(280);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = s.candidates;
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 4);
  const visibleCount = Math.ceil(height / rowH) + 8;
  const slice = items.slice(start, start + visibleCount);
  const top = start * rowH;

  const header = s.seed
    ? `Near selected · ${items.length} candidates`
    : `Records in view · ${items.length}`;

  const playingId = s.playing?.id;

  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[#0D0F13] ${embedded ? "" : "border-t border-[#1B1F27]"}`}
      aria-label="Candidate tracks"
    >
      {embedded ? null : (
      <div className="flex h-9 shrink-0 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-[12.5px] font-semibold text-paper">{header}</h2>
        </div>
      </div>
      )}
      <div
        role="rowgroup"
        className="sticky top-0 hidden h-7 shrink-0 items-center bg-[#0D0F13] px-4 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5B6373] min-[900px]:grid min-[900px]:grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1fr)_52px_40px_minmax(5.75rem,0.95fr)_minmax(4.75rem,0.7fr)_32px] min-[900px]:gap-2.5"
      >
        <span />
        <span>Title</span>
        <span>Artist</span>
        <span>BPM</span>
        <span>Key</span>
        <span>Genre</span>
        <span>Vibe</span>
        <span />
      </div>
      <div
        ref={scroller}
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
                playing={playingId === track.id && (s.playStatus === "playing" || s.playStatus === "buffering")}
                focused={s.focusedId === track.id}
                score={s.scoreFor(track)}
                onSelect={(event) => {
                  const additive = "metaKey" in event && (event.metaKey || event.ctrlKey);
                  const range = "shiftKey" in event && event.shiftKey;
                  s.selectTrack(track.id, { additive, range });
                }}
                onPlay={() => {
                  if (playingId === track.id && (s.playStatus === "playing" || s.playStatus === "buffering")) s.pause();
                  else s.play(track.id);
                }}
                onOpen={() => s.openDrawer(track.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
