"use client";

import { useEffect, useRef } from "react";
import {
  docksQ,
  usesFilterSheet,
  usesSegmentedViews,
  useBreakpoint,
} from "@/lib/studio/use-breakpoint";
import { looksLikeQAsk } from "@/lib/studio/q-intent";
import { FilterRail } from "./FilterRail";
import { FilterChipBar } from "./FilterChipBar";
import { MapTrustBar } from "./MapTrustBar";
import { StudioMap } from "./StudioMap";
import { CandidateList } from "./CandidateList";
import { QPanel } from "./QPanel";
import { CratePanel } from "./CratePanel";
import { TrackDrawer } from "./TrackDrawer";
import { AudioPlayer } from "./AudioPlayer";
import { StudioShortcuts } from "./StudioShortcuts";
import { useStudio } from "./StudioProvider";

export function StudioApp({ signedIn = false }: { signedIn?: boolean }) {
  const s = useStudio();
  const bp = useBreakpoint();
  const sheetFilters = usesFilterSheet(bp);
  const segmented = usesSegmentedViews(bp);
  const sidecarOpen = s.sidecar !== "closed";
  const sidecarDocked = docksQ(bp) && sidecarOpen;
  const sidecarOverlay = sidecarOpen && !docksQ(bp);
  const drawerSheet = bp === "small";
  const nowPlayingCard = bp === "mobile";
  const exclusive = bp !== "desktop" && bp !== "laptop";
  const bodyColumns = sheetFilters
    ? "minmax(0, 1fr)"
    : sidecarDocked
      ? "var(--left-rail-width) minmax(0, 1fr) var(--q-panel-width)"
      : "var(--left-rail-width) minmax(0, 1fr)";

  useEffect(() => {
    if (!exclusive) return;
    if (sidecarOpen && s.drawerOpen) s.closeDrawer();
  }, [exclusive, sidecarOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative grid h-dvh grid-rows-[56px_minmax(0,1fr)_78px] overflow-hidden bg-[#0A0B0D] text-[#EDEFF3]">
      <StudioShortcuts />
      <StudioTopBar signedIn={signedIn} compact={sheetFilters} />
      <div className="grid min-h-0" style={{ gridTemplateColumns: bodyColumns }}>
        {!sheetFilters ? (
          <div className="min-h-0">
            <FilterRail signedIn={signedIn} />
          </div>
        ) : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {sheetFilters ? <FilterChipBar /> : null}

          {segmented && s.mobileView === "list" ? (
            <CandidateList />
          ) : segmented && s.mobileView === "crate" ? (
            <CratePanel />
          ) : segmented && s.mobileView === "q" ? (
            <QPanel />
          ) : segmented && s.mobileView === "map" ? (
            <StudioMap />
          ) : (
            <div
              className="grid min-h-0 flex-1"
              data-studio-split
              style={{ gridTemplateRows: `auto minmax(0, 1fr) ${s.listHeight}px` }}
            >
              <MapTrustBar />
              <StudioMap />
              <div className="relative flex min-h-0 flex-col border-t border-[#1B1F27] bg-[#0D0F13]">
                <ListResizeHandle height={s.listHeight} onChange={s.setListHeight} />
                <div className="flex h-[38px] shrink-0 items-center gap-3.5 border-b border-[#171B21] px-4">
                  <span className="text-[12.5px] font-semibold">
                    {s.qStatus === "found" && s.qAsk ? "Applied from Q" : "Records in view"}
                  </span>
                  <span className="text-[11.5px] text-[#7C8698]">
                    {s.candidates.length.toLocaleString()} tracks
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <CandidateList embedded />
                </div>
              </div>
            </div>
          )}

          {segmented ? <MobileViewTabs /> : null}

          {s.drawerOpen && nowPlayingCard ? <NowPlayingCard /> : null}

          {s.drawerOpen && !drawerSheet && !nowPlayingCard && !(exclusive && sidecarOpen) ? (
            <div className="absolute inset-y-0 right-0 z-20 hidden md:block">
              <TrackDrawer />
            </div>
          ) : null}
          {sidecarOverlay && !segmented && s.sidecar === "q" ? <QPanel overlay /> : null}
          {sidecarOverlay && !segmented && s.sidecar === "crate" ? <CratePanel overlay /> : null}
        </div>

        {sidecarDocked && s.sidecar === "q" ? (
          <div className="min-h-0">
            <QPanel />
          </div>
        ) : null}
        {sidecarDocked && s.sidecar === "crate" ? (
          <div className="min-h-0">
            <CratePanel />
          </div>
        ) : null}
      </div>

      {s.drawerOpen && drawerSheet ? <TrackDrawer asSheet /> : null}
      {s.advancedOpen && sheetFilters ? <FilterSheet signedIn={signedIn} /> : null}
      <AudioPlayer />
    </div>
  );
}

function ListResizeHandle({
  height,
  onChange,
}: {
  height: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; h: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, h: height };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const split = event.currentTarget.closest("[data-studio-split]");
    const max = split ? Math.round(split.getBoundingClientRect().height * 0.82) : 720;
    const next = drag.current.h + (drag.current.y - event.clientY);
    onChange(Math.min(Math.max(Math.round(next), 52), max));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize records list"
      aria-valuenow={Math.round(height)}
      title="Drag to resize"
      className="absolute -top-1.5 left-0 right-0 z-20 flex h-[44px] cursor-row-resize touch-none items-start justify-center pt-0.5"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="h-1 w-10 rounded-full bg-[#5B6373]" />
    </div>
  );
}

function MobileViewTabs() {
  const s = useStudio();
  return (
    <div
      className="flex h-[52px] shrink-0 items-center justify-around border-t border-[#1B1F27] bg-[#0D0F13] text-[11px]"
      role="tablist"
      aria-label="Studio view"
    >
      {(["map", "list", "crate", "q"] as const).map((view) => (
        <button
          key={view}
          type="button"
          role="tab"
          aria-selected={s.mobileView === view}
          className="h-8 px-2 capitalize"
          style={{
            color:
              s.mobileView === view ? (view === "q" ? "#C4B6F5" : "#EDEFF3") : "#8B929F",
          }}
          onClick={() => {
            s.setMobileView(view);
            if (view === "q") s.openQ();
            else if (view === "crate") s.openCrate();
            else s.closeSidecar();
          }}
        >
          {view === "crate" ? "Crates" : view === "q" ? "Q" : view}
        </button>
      ))}
    </div>
  );
}

function StudioTopBar({ signedIn, compact }: { signedIn: boolean; compact: boolean }) {
  const s = useStudio();
  const qHandoff = looksLikeQAsk(s.filters.query);

  return (
    <header className="col-span-full flex min-w-0 items-center gap-3.5 border-b border-[#1B1F27] bg-[#0D0F13] px-5">
      <a href={signedIn ? "/app" : "/"} className="flex shrink-0 items-center gap-[9px] text-[#EDEFF3] no-underline">
        <span className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-[#E9A63C]">
          <span className="h-1 w-1 rounded-full bg-[#E9A63C]" />
        </span>
        <span className="text-[14px] font-semibold">Crate Dig</span>
      </a>
      <label className="flex h-9 max-w-[320px] flex-1 items-center gap-2 rounded-[9px] border border-[#2A2F39] bg-[#0F1116] px-3">
        <span className="text-[12.5px] text-[#6B7383]" aria-hidden>
          ⌕
        </span>
        <span className="sr-only">Search title, artist, label</span>
        <input
          id="studio-search"
          type="search"
          value={s.filters.query}
          onChange={(event) => s.setFilters({ ...s.filters, query: event.target.value })}
          placeholder="Search title, artist, label…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#EDEFF3] outline-none placeholder:text-[#6B7383]"
        />
        {qHandoff ? (
          <button
            type="button"
            className="shrink-0 bg-transparent text-[11px] text-[#C4B6F5]"
            onClick={() => {
              const prompt = s.filters.query;
              s.setFilters({ ...s.filters, query: "" });
              s.askQ(prompt);
            }}
          >
            Ask Q
          </button>
        ) : null}
      </label>
      {compact ? (
        <button
          type="button"
          onClick={() => s.openQ()}
          className="flex h-8 shrink-0 items-center rounded-[6px] border border-[#3A3350] bg-[#181430] px-2.5 text-[11px] text-[#C4B6F5]"
        >
          Q
        </button>
      ) : (
        <button
          type="button"
          onClick={() => s.openQ()}
          className="flex h-9 max-w-[360px] flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-[#3A3350] bg-[#14101F] px-3 text-left"
        >
          <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] border border-[#4A3F70] bg-[#1C1732] text-[9px] font-semibold text-[#8B7BF0]">
            Q
          </span>
          <span className="flex-1 text-[13px] text-[#8B929F]">Ask Q to find, explain, or shape a crate…</span>
        </button>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div
          aria-hidden
          className="h-7 w-7 rounded-full"
          style={{ background: "linear-gradient(140deg,#8B7BF0,#E4705A)" }}
        />
      </div>
    </header>
  );
}

function NowPlayingCard() {
  const s = useStudio();
  const track = s.primarySelected;
  if (!track) return null;
  const isPlaying = s.playing?.id === track.id && s.playStatus === "playing";
  return (
    <article className="absolute inset-x-3 bottom-[calc(78px+0.75rem)] z-20 rounded-[13px] border border-[#262B34] bg-[#0D0F13] px-3 py-3">
      <p className="font-serif text-[1.35rem] leading-tight">{track.title}</p>
      <p className="mt-1 text-[13px] text-[#B7BEC9]">
        {track.artist}
        <span className="ml-2 text-[11.5px]">
          {track.bpm ? Math.round(track.bpm) : "—"} · {track.key ?? "—"}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="h-8 rounded-full bg-[#E9A63C] px-4 text-[13px] font-medium text-[#181203]"
          onClick={() => (isPlaying ? s.pause() : s.play(track.id))}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="h-8 rounded-full border border-[#262B34] px-3 text-[13px]"
          onClick={() => s.addToCrate(track.id)}
        >
          + Crate
        </button>
      </div>
    </article>
  );
}

function FilterSheet({ signedIn }: { signedIn: boolean }) {
  const s = useStudio();
  return (
    <div className="absolute inset-0 z-40 bg-[#0A0B0D]/70" role="presentation" onClick={() => s.setAdvancedOpen(false)}>
      <div
        role="dialog"
        aria-label="Filters"
        className="absolute inset-y-0 left-0 w-[min(20rem,100%)] border-r border-[#1B1F27] bg-[#0D0F13]"
        onClick={(event) => event.stopPropagation()}
      >
        <FilterRail signedIn={signedIn} />
      </div>
    </div>
  );
}
