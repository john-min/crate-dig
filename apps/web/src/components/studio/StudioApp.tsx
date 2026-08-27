"use client";

import { useEffect } from "react";
import { docksQ, usesFilterSheet, usesSegmentedViews, useBreakpoint } from "@/lib/studio/use-breakpoint";
import { FilterRail } from "./FilterRail";
import { FilterChipBar } from "./FilterChipBar";
import { MapTrustBar } from "./MapTrustBar";
import { StudioMap } from "./StudioMap";
import { CandidateList } from "./CandidateList";
import { QPanel } from "./QPanel";
import { TrackDrawer } from "./TrackDrawer";
import { AudioPlayer } from "./AudioPlayer";
import { StudioShortcuts } from "./StudioShortcuts";
import { useStudio } from "./StudioProvider";
import { MapFallbackList } from "./MapFallbackList";
import { Wordmark } from "@/components/brand/Wordmark";

export function StudioApp({ signedIn = false }: { signedIn?: boolean }) {
  const s = useStudio();
  const bp = useBreakpoint();
  const sheetFilters = usesFilterSheet(bp);
  const segmented = usesSegmentedViews(bp);
  const qIsDocked = docksQ(bp) && s.qOpen;
  const qIsOverlay = s.qOpen && !docksQ(bp);
  const drawerSheet = bp === "small";
  const nowPlayingCard = bp === "mobile";
  const exclusive = bp !== "desktop";
  const bodyColumns = sheetFilters
    ? "minmax(0, 1fr)"
    : qIsDocked
      ? "var(--left-rail-width) minmax(0, 1fr) var(--q-panel-width)"
      : "var(--left-rail-width) minmax(0, 1fr)";

  useEffect(() => {
    if (!exclusive) return;
    if (s.qOpen && s.drawerOpen) s.closeDrawer();
  }, [exclusive, s.qOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative grid h-dvh grid-rows-[56px_minmax(0,1fr)_var(--player-height)] overflow-hidden bg-ink text-paper">
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
          {segmented ? (
            <div
              className="flex gap-1 border-b border-[var(--hairline)] px-3 py-1.5"
              role="tablist"
              aria-label="Studio view"
            >
              {(["map", "list", "crate"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={s.mobileView === view}
                  className={`h-8 rounded-[var(--radius-md)] px-3 text-[13px] capitalize ${
                    s.mobileView === view ? "bg-[var(--control)] text-paper" : "text-paper-dim"
                  }`}
                  onClick={() => s.setMobileView(view)}
                >
                  {view === "crate" ? "Crates" : view}
                </button>
              ))}
            </div>
          ) : null}
          {bp === "desktop" || bp === "laptop" ? <MapTrustBar /> : null}

          {segmented && s.mobileView === "list" ? (
            <CandidateList />
          ) : segmented && s.mobileView === "crate" ? (
            <CrateReview />
          ) : segmented && s.mobileView === "map" ? (
            <StudioMap />
          ) : (
            <>
              <StudioMap />
              <div className="h-[min(204px,28vh)] min-h-0 shrink-0 overflow-hidden">
                <CandidateList />
              </div>
            </>
          )}

          {s.drawerOpen && nowPlayingCard ? <NowPlayingCard /> : null}

          {s.drawerOpen && !drawerSheet && !nowPlayingCard && !(exclusive && s.qOpen) ? (
            <div className="absolute inset-y-0 right-0 z-20 hidden md:block">
              <TrackDrawer />
            </div>
          ) : null}
          {qIsOverlay ? <QPanel overlay /> : null}
        </div>

        {qIsDocked ? (
          <div className="min-h-0">
            <QPanel />
          </div>
        ) : null}
      </div>

      {s.drawerOpen && drawerSheet ? <TrackDrawer asSheet /> : null}
      {s.advancedOpen && sheetFilters ? <FilterSheet /> : null}
      <AudioPlayer />
    </div>
  );
}

function StudioTopBar({ signedIn, compact }: { signedIn: boolean; compact: boolean }) {
  const s = useStudio();
  return (
    <header className="col-span-full flex min-w-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--panel)] px-3.5">
      <div className={compact ? "shrink-0" : "w-[calc(var(--left-rail-width)-14px)] shrink-0"}>
        <Wordmark href={signedIn ? "/app" : "/map"} size="sm" />
      </div>
      <label className="sr-only" htmlFor="studio-search">
        Search or describe a vibe
      </label>
      <input
        id="studio-search"
        type="search"
        value={s.filters.query}
        onChange={(e) => s.setFilters({ ...s.filters, query: e.target.value })}
        placeholder="Search or describe a vibe…"
        className="h-9 w-[min(520px,46vw)] min-w-0 shrink rounded-[var(--radius-md)] border border-line bg-[var(--raised)] px-3.5 text-[13px] outline-none placeholder:text-muted focus:border-violet/60"
      />
      <div className="ml-auto hidden h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-[var(--raised)] px-3 lg:flex">
        <label className="text-[11.5px] text-muted" htmlFor="studio-color-by">
          Colour by
        </label>
        <select
          id="studio-color-by"
          value={s.colorBy}
          onChange={(event) => s.setColorBy(event.target.value as typeof s.colorBy)}
          className="bg-transparent text-[12px] text-paper outline-none"
        >
          <option value="mood">Mood</option>
          <option value="cluster">Cluster</option>
          <option value="energy">Energy</option>
          <option value="similarity">Similarity</option>
        </select>
      </div>
      <button
        type="button"
        className={`flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border px-3 text-[12px] font-medium transition-colors ${
          s.qOpen
            ? "border-violet/50 bg-violet/15 text-paper"
            : "border-line bg-[var(--raised)] text-paper-dim hover:border-violet/40 hover:text-paper"
        }`}
        aria-label={s.qOpen ? "Hide Q" : "Ask Q"}
        onClick={() => (s.qOpen ? s.closeQ() : s.openQ())}
      >
        <span className="mr-2 text-violet">Q</span>
        <span className="hidden sm:inline">{s.qOpen ? "Close" : "Ask Q"}</span>
      </button>
    </header>
  );
}

function NowPlayingCard() {
  const s = useStudio();
  const track = s.primarySelected;
  if (!track) return null;
  const isPlaying = s.playing?.id === track.id && s.playStatus === "playing";
  return (
    <article className="absolute inset-x-3 bottom-[calc(var(--player-height)+0.75rem)] z-20 rounded-[var(--radius-lg)] border border-line bg-[var(--panel)] px-3 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
      <p className="font-serif text-[1.35rem] leading-tight">{track.title}</p>
      <p className="mt-1 text-[13px] text-paper-dim">
        {track.artist}
        <span className="font-data ml-2 text-[11.5px]">
          {track.bpm ? Math.round(track.bpm) : "—"} BPM · {track.key ?? "—"}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="h-8 rounded-full bg-amber px-4 text-[13px] font-medium text-[var(--text-on-accent-dark)]"
          onClick={() => (isPlaying ? s.pause() : s.play(track.id))}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="h-8 rounded-full border border-line px-3 text-[13px]"
          onClick={() => s.addToCrate(track.id)}
        >
          + Crate
        </button>
        <button
          type="button"
          className="h-8 rounded-full border border-line px-3 text-[13px] text-blue"
          onClick={() => s.askQ(`What works after ${track.title}?`)}
        >
          Ask Q
        </button>
      </div>
    </article>
  );
}

function CrateReview() {
  const s = useStudio();
  const crate = s.activeCrate;
  if (!crate) return <MapFallbackList />;
  const tracks = crate.trackIds
    .map((id) => s.tracks.find((t) => t.id === id))
    .filter(Boolean);
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <h2 className="font-serif text-[1.75rem]">{crate.name}</h2>
      <p className="mt-2 text-[14px] text-paper-dim">
        {crate.intention} · {crate.room} · {crate.timeOfDay}
      </p>
      <ul className="mt-4 divide-y divide-[var(--hairline)]">
        {tracks.map((track) => (
          <li key={track!.id} className="flex items-center justify-between py-2 text-[14px]">
            <button type="button" className="text-left hover:text-amber" onClick={() => s.openDrawer(track!.id)}>
              {track!.title}
              <span className="block text-[12px] text-paper-dim">{track!.artist}</span>
            </button>
            <button type="button" className="font-data text-[12px] text-muted" onClick={() => s.play(track!.id)}>
              Play
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterSheet() {
  const s = useStudio();
  return (
    <div className="absolute inset-0 z-40 bg-ink/70" role="presentation" onClick={() => s.setAdvancedOpen(false)}>
      <div
        role="dialog"
        aria-label="Filters"
        className="absolute inset-y-0 left-0 w-[min(20rem,100%)] border-r border-line bg-[var(--panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <FilterRail signedIn={false} />
      </div>
    </div>
  );
}
