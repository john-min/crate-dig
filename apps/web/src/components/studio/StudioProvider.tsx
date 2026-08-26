"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activeFilterCount,
  displaySimilarityReasons,
  mapTrackToStudio,
  matchesStudioFilters,
  neighborIsNonSonic,
  neighborReasonCopy,
  orderTracksByNeighbors,
} from "@crate-dig/app-core";
import type {
  CrateDigAdapter,
  Neighbor,
  ProjectionCapability,
} from "@crate-dig/contracts";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { EMPTY_FILTERS, MODEL_VERSION } from "@/lib/studio/constants";
import type {
  ColorBy,
  Crate,
  LiveMessage,
  LibraryView,
  MobileView,
  PlayStatus,
  QCard,
  QStatus,
  RowDensity,
  StudioFilters,
  StudioTrack,
} from "@/lib/studio/types";

type StudioContextValue = {
  tracks: StudioTrack[];
  crates: Crate[];
  modelVersion: string;
  filters: StudioFilters;
  setFilters: (next: StudioFilters | ((prev: StudioFilters) => StudioFilters)) => void;
  clearFilters: () => void;
  filterCount: number;
  colorBy: ColorBy;
  setColorBy: (value: ColorBy) => void;
  visible: StudioTrack[];
  seed: StudioTrack | null;
  seedIds: string[];
  setSeed: (id: string | null) => void;
  selectedIds: string[];
  focusedId: string | null;
  primarySelected: StudioTrack | null;
  selectTrack: (id: string | null, opts?: { additive?: boolean; range?: boolean }) => void;
  focusTrack: (id: string | null) => void;
  playing: StudioTrack | null;
  playStatus: PlayStatus;
  playheadSec: number;
  play: (id?: string) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (sec: number) => void;
  drawerOpen: boolean;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  qOpen: boolean;
  qStatus: QStatus;
  qCards: QCard[];
  qPrompt: string;
  setQPrompt: (value: string) => void;
  openQ: () => void;
  closeQ: () => void;
  toggleQ: () => void;
  askQ: (prompt?: string) => void;
  activeCrateId: string;
  setActiveCrateId: (id: string) => void;
  activeCrate: Crate | null;
  addToCrate: (id: string) => void;
  density: RowDensity;
  setDensity: (value: RowDensity) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (value: boolean) => void;
  mobileView: MobileView;
  setMobileView: (value: MobileView) => void;
  selectedCluster: number | null;
  setSelectedCluster: (value: number | null) => void;
  hiddenIds: Set<string>;
  hideFromRecs: (id: string) => void;
  undoHide: () => void;
  liveMessage: string;
  scoreFor: (track: StudioTrack) => number | null;
  reasonsFor: (track: StudioTrack) => ReturnType<typeof displaySimilarityReasons>;
  candidates: StudioTrack[];
  webglOk: boolean;
  setWebglOk: (value: boolean) => void;
  howToReadOpen: boolean;
  setHowToReadOpen: (value: boolean) => void;
  librarySource: "mock" | "disk" | "cloud";
  libraryName: string;
  libraryView: LibraryView;
  setLibraryView: (value: LibraryView) => void;
  playedIds: Set<string>;
  recentCount: number;
  unplayedCount: number;
  analysisReady: boolean;
  selectNearest: (limit?: number) => void;
  addSelectedToCrate: () => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export interface StudioProviderProps {
  adapter: CrateDigAdapter;
  children: ReactNode;
  initialCrates?: Crate[];
  librarySource: "mock" | "disk" | "cloud";
  projection?: ProjectionCapability;
}

export function StudioProvider({
  adapter,
  children,
  initialCrates = [],
  librarySource,
  projection,
}: StudioProviderProps) {
  const [allTracks, setAllTracks] = useState<StudioTrack[]>([]);
  const [libraryName, setLibraryName] = useState("Library");
  const [neighborState, setNeighborState] = useState<{
    seedId: string;
    items: readonly Neighbor[];
  } | null>(null);
  const [filters, setFilters] = useState<StudioFilters>(EMPTY_FILTERS);
  const [colorBy, setColorBy] = useState<ColorBy>("mood");
  const [seedId, setSeedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [libraryView, setLibraryView] = useState<LibraryView>("all");
  const [recentCutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playStatus, setPlayStatus] = useState<PlayStatus>("idle");
  const [playheadSec, setPlayheadSec] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const [qRequest, setQRequest] = useState<"idle" | "loading" | "failure" | "no-results">("idle");
  const [qCards, setQCards] = useState<QCard[]>([]);
  const [qPrompt, setQPrompt] = useState("");
  const [crates, setCrates] = useState(initialCrates);
  const [activeCrateId, setActiveCrateId] = useState(initialCrates[0]?.id ?? "sunset-lounge");
  const [density, setDensity] = useState<RowDensity>("compact");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [undoHideId, setUndoHideId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveMessage>({ id: 0, text: "" });
  const [webglOk, setWebglOk] = useState(true);
  const [howToReadOpen, setHowToReadOpen] = useState(false);
  const playTimer = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingIdRef = useRef<string | null>(null);

  useEffect(() => {
    playingIdRef.current = playingId;
  }, [playingId]);

  const announce = useCallback((text: string) => {
    setLive((prev) => ({ id: prev.id + 1, text }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [libraries, records, projectionFeed] = await Promise.all([
          adapter.listLibraries(),
          adapter.listTracks(),
          projection?.getProjectionMapFeed().catch(() => undefined),
        ]);
        if (cancelled) return;
        const points = new Map(
          projectionFeed?.points.map((point) => [point.trackId, point]) ?? [],
        );
        setAllTracks(records.map((track) => mapTrackToStudio(track, points.get(track.id))));
        setLibraryName(libraries[0]?.name ?? "Library");
        announce(`Loaded ${records.length} tracks from ${libraries[0]?.name ?? "the library"}.`);
      } catch (error) {
        if (cancelled) return;
        setAllTracks([]);
        announce(error instanceof Error ? error.message : "The library could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, announce, projection]);

  useEffect(() => {
    const el = new Audio();
    el.preload = "metadata";
    audioRef.current = el;
    const onTime = () => setPlayheadSec(el.currentTime || 0);
    const onPlaying = () => setPlayStatus("playing");
    const onPause = () => {
      if (!el.ended) setPlayStatus("paused");
    };
    const onEnded = () => {
      setPlayStatus("paused");
      setPlayheadSec(el.duration || 0);
    };
    const onWait = () => setPlayStatus("buffering");
    const onError = () => {
      setPlayStatus("failed");
      announce("Playback failed. The file may be missing or in a format this browser cannot decode.");
    };
    const onMeta = () => {
      const duration = el.duration;
      const id = playingIdRef.current;
      if (!id || !Number.isFinite(duration)) return;
      setAllTracks((prev) =>
        prev
          .map((track) => (track.id === id ? { ...track, durationSec: duration } : track)),
      );
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("waiting", onWait);
    el.addEventListener("error", onError);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("waiting", onWait);
      el.removeEventListener("error", onError);
      el.removeEventListener("loadedmetadata", onMeta);
      audioRef.current = null;
    };
  }, [announce]);

  const tracks = useMemo(
    () => allTracks.map((t) => (hiddenIds.has(t.id) ? { ...t, hiddenFromRecs: true } : t)),
    [allTracks, hiddenIds],
  );

  const seed = useMemo(() => tracks.find((t) => t.id === seedId) ?? null, [tracks, seedId]);
  const playing = useMemo(() => tracks.find((t) => t.id === playingId) ?? null, [tracks, playingId]);
  const primarySelected = useMemo(
    () => tracks.find((t) => t.id === selectedIds[0]) ?? null,
    [tracks, selectedIds],
  );

  const visible = useMemo(() => {
    return tracks.filter((track) => {
      if (libraryView === "unplayed" && playedIds.has(track.id)) return false;
      if (
        libraryView === "recent" &&
        (!track.createdAt || new Date(track.createdAt).getTime() < recentCutoff)
      ) {
        return false;
      }
      return matchesStudioFilters(track, filters, seed);
    });
  }, [tracks, filters, seed, libraryView, playedIds, recentCutoff]);

  const recentCount = useMemo(
    () =>
      tracks.filter(
        (track) => track.createdAt && new Date(track.createdAt).getTime() >= recentCutoff,
      ).length,
    [recentCutoff, tracks],
  );
  const unplayedCount = tracks.length - playedIds.size;
  const analysisReady = tracks.some((track) => track.analysisStatus === "ok");

  const filterCount = activeFilterCount(filters);

  useEffect(() => {
    if (!seedId) return;
    let cancelled = false;
    void adapter
      .getTrackNeighbors(seedId, { limit: 80, channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL })
      .then((items) => {
        if (!cancelled) setNeighborState({ seedId, items });
      })
      .catch(() => {
        if (!cancelled) setNeighborState({ seedId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, seedId]);

  const neighbors = useMemo(
    () => (neighborState?.seedId === seedId ? neighborState.items : []),
    [neighborState, seedId],
  );

  const neighborScores = useMemo(
    () => new Map(neighbors.map((neighbor) => [neighbor.trackId, neighbor.score])),
    [neighbors],
  );

  const scoreFor = useCallback(
    (track: StudioTrack) =>
      analysisReady && seed && track.id !== seed.id ? (neighborScores.get(track.id) ?? null) : null,
    [analysisReady, neighborScores, seed],
  );

  const reasonsFor = useCallback(
    (track: StudioTrack) =>
      displaySimilarityReasons(neighbors.find((neighbor) => neighbor.trackId === track.id) ?? null),
    [neighbors],
  );

  const candidates = useMemo(() => {
    const pool = visible.filter((t) => t.analysisStatus !== "failed");
    if (seed) {
      return orderTracksByNeighbors(pool, neighbors);
    }
    return [...pool].sort((a, b) => a.cluster - b.cluster || a.title.localeCompare(b.title));
  }, [neighbors, visible, seed]);

  const activeCrate = crates.find((c) => c.id === activeCrateId) ?? null;

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    announce("Filters cleared. Showing the full analyzed library.");
  }, [announce]);

  const setSeed = useCallback(
    (id: string | null) => {
      setSeedId(id);
      if (id) {
        const track = tracks.find((t) => t.id === id);
        announce(track ? `Seed set to ${track.title}` : "Seed set");
      } else {
        announce("Seed cleared");
      }
    },
    [announce, tracks],
  );

  const selectTrack = useCallback(
    (id: string | null, opts?: { additive?: boolean; range?: boolean }) => {
      if (id == null) {
        setSelectedIds([]);
        setFocusedId(null);
        setDrawerOpen(false);
        announce("Selection cleared");
        return;
      }
      setFocusedId(id);
      setSelectedIds((prev) => {
        if (opts?.additive) {
          return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        }
        if (opts?.range && prev[0]) {
          const start = candidates.findIndex((t) => t.id === prev[0]);
          const end = candidates.findIndex((t) => t.id === id);
          if (start >= 0 && end >= 0) {
            const [a, b] = start < end ? [start, end] : [end, start];
            return candidates.slice(a, b + 1).map((t) => t.id);
          }
        }
        return [id];
      });
    },
    [announce, candidates],
  );

  const openDrawer = useCallback(
    (id: string) => {
      selectTrack(id);
      setDrawerOpen(true);
    },
    [selectTrack],
  );

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const stopTimer = () => {
    if (playTimer.current != null) {
      window.clearInterval(playTimer.current);
      playTimer.current = null;
    }
  };

  const play = useCallback(
    (id?: string) => {
      const targetId = id ?? playingId ?? selectedIds[0];
      const track = tracks.find((t) => t.id === targetId);
      if (!track) return;
      setPlayedIds((prev) => new Set([...prev, track.id]));
      stopTimer();
      const el = audioRef.current;
      const resume = Boolean(
        el && playingId === track.id && playStatus === "paused" && el.src,
      );
      if (!resume) {
        setPlayingId(track.id);
        setPlayheadSec(0);
        if (el) {
          el.pause();
          el.removeAttribute("src");
        }
      }
      if (track.previewState === "expired" || track.previewState === "failed") {
        setPlayStatus("failed");
        announce(
          track.previewState === "expired"
            ? "Signed preview URL expired. Crate and library are unchanged."
            : `Preview failed for ${track.title}.`,
        );
        return;
      }

      const startSimulatedPlayback = () => {
        setPlayStatus("loading");
        announce(`Loading ${track.title}`);
        window.setTimeout(() => {
          setPlayStatus("playing");
          announce(`Playing ${track.title}`);
          playTimer.current = window.setInterval(() => {
            setPlayheadSec((sec) => {
              if (sec + 0.25 >= track.durationSec) {
                stopTimer();
                setPlayStatus("paused");
                return track.durationSec;
              }
              return sec + 0.25;
            });
          }, 250);
        }, 280);
      };

      const startUrlPlayback = (url: string) => {
        if (!el) {
          startSimulatedPlayback();
          return;
        }
        setPlayStatus("loading");
        announce(`Loading ${track.title}`);
        if (!resume) {
          el.src = url;
        }
        void el.play().then(
          () => announce(`Playing ${track.title}`),
          () => {
            setPlayStatus("failed");
            announce(`Could not play ${track.title}.`);
          },
        );
      };

      if (resume && el?.src) {
        startUrlPlayback(el.src);
        return;
      }

      void (async () => {
        try {
          const playback = await adapter.getPlaybackUrl(track.id);
          if (playback.url) {
            startUrlPlayback(playback.url);
            return;
          }
        } catch (error) {
          if (adapter.runtime === "cloud") {
            setPlayStatus("failed");
            announce(error instanceof Error ? error.message : `Could not play ${track.title}.`);
            return;
          }
        }
        if (track.previewUrl) {
          startUrlPlayback(track.previewUrl);
          return;
        }
        if (track.previewState === "missing") {
          setPlayStatus("failed");
          announce(`${track.title} has no playable preview URL.`);
          return;
        }
        startSimulatedPlayback();
      })();
    },
    [adapter, announce, playStatus, playingId, selectedIds, tracks],
  );

  const pause = useCallback(() => {
    stopTimer();
    audioRef.current?.pause();
    setPlayStatus("paused");
    if (playing) announce(`Paused ${playing.title}`);
  }, [announce, playing]);

  const togglePlay = useCallback(() => {
    if (playStatus === "playing" || playStatus === "buffering") pause();
    else play();
  }, [pause, play, playStatus]);

  const seek = useCallback((sec: number) => {
    const next = Math.max(0, sec);
    setPlayheadSec(next);
    if (audioRef.current && audioRef.current.src) audioRef.current.currentTime = next;
  }, []);

  const buildQCards = useCallback(
    (from: StudioTrack, pool: StudioTrack[], ranking: readonly Neighbor[]): QCard[] => {
      const ranked = orderTracksByNeighbors(
        pool.filter((track) => track.id !== from.id),
        ranking,
      );
      const byId = new Map(ranking.map((item) => [item.trackId, item]));
      return ranked.flatMap((track) => {
        const neighbor = byId.get(track.id);
        if (!neighbor) return [];
        return [
          {
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            score: neighbor.score,
            bpm: track.bpm,
            key: track.key,
            reason: neighborReasonCopy(neighbor),
            nonSonic: neighborIsNonSonic(neighbor),
          },
        ];
      }).slice(0, 8);
    },
    [],
  );

  const requestNeighbors = useCallback(
    (trackId: string) =>
      adapter.getTrackNeighbors(trackId, {
        limit: 80,
        channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
      }),
    [adapter],
  );

  const askQ = useCallback(
    (prompt?: string) => {
      const text = (prompt ?? qPrompt).trim();
      setQOpen(true);
      if (!analysisReady) {
        setQRequest("no-results");
        setQCards([]);
        announce("Analyze this library before Q searches for sonic neighbors.");
        return;
      }
      setQRequest("loading");
      announce("Q is listening for nearby records");
      window.setTimeout(() => {
        if (/fail|offline/i.test(text)) {
          setQRequest("failure");
          setQCards([]);
          announce("Q couldn’t finish that search. Your library and crate are unchanged.");
          return;
        }
        const from = primarySelected ?? seed ?? visible[0];
        if (!from || visible.length === 0) {
          setQRequest("no-results");
          setQCards([]);
          announce("Q didn’t find a confident match.");
          return;
        }
        void requestNeighbors(from.id)
          .then((items) => {
            const cards = buildQCards(from, visible, items);
            if (!items.length || !cards.length) {
              setQRequest("no-results");
              setQCards([]);
              announce(
                items.length
                  ? "Q didn’t find a confident match."
                  : "Neighbor ranking is unavailable. Q will not invent sonic matches.",
              );
            } else {
              setQRequest("idle");
              setQCards(cards);
              announce(
                selectedIds.length > 1
                  ? `Q grouped ${selectedIds.length} selected records.`
                  : `Q found ${cards.length} nearby records.`,
              );
            }
          })
          .catch(() => {
            setQRequest("failure");
            setQCards([]);
            announce("Q couldn’t finish that search. Your library and crate are unchanged.");
          });
      }, 700);
    },
    [
      analysisReady,
      announce,
      buildQCards,
      primarySelected,
      qPrompt,
      requestNeighbors,
      seed,
      selectedIds.length,
      visible,
    ],
  );

  const openQ = useCallback(() => {
    setQOpen(true);
    const from = primarySelected ?? seed;
    if (!analysisReady) {
      setQRequest("no-results");
      setQCards([]);
      return;
    }
    if (!from) {
      setQRequest("idle");
      setQCards([]);
      return;
    }
    setQRequest("loading");
    void requestNeighbors(from.id)
      .then((items) => {
        const cards = buildQCards(from, visible, items);
        setQCards(cards);
        setQRequest(cards.length ? "idle" : "no-results");
      })
      .catch(() => {
        setQCards([]);
        setQRequest("failure");
      });
  }, [analysisReady, buildQCards, primarySelected, requestNeighbors, seed, visible]);

  const closeQ = useCallback(() => setQOpen(false), []);
  const toggleQ = useCallback(() => {
    setQOpen((open) => {
      if (open) return false;
      queueMicrotask(() => openQ());
      return true;
    });
  }, [openQ]);

  const addToCrate = useCallback(
    (id: string) => {
      const track = tracks.find((t) => t.id === id);
      setCrates((prev) =>
        prev.map((c) =>
          c.id === activeCrateId && !c.trackIds.includes(id)
            ? { ...c, trackIds: [...c.trackIds, id] }
            : c,
        ),
      );
      announce(track ? `Added ${track.title} to crate. Undo with the crate list.` : "Added to crate");
    },
    [activeCrateId, announce, tracks],
  );

  const selectNearest = useCallback(
    (limit = 20) => {
      const ids = candidates.slice(0, limit).map((track) => track.id);
      setSelectedIds(ids);
      setFocusedId(ids[0] ?? null);
      announce(`Selected ${ids.length} records in the current view.`);
    },
    [announce, candidates],
  );

  const addSelectedToCrate = useCallback(() => {
    if (!selectedIds.length) return;
    setCrates((prev) =>
      prev.map((crate) =>
        crate.id === activeCrateId
          ? { ...crate, trackIds: [...new Set([...crate.trackIds, ...selectedIds])] }
          : crate,
      ),
    );
    announce(`Added ${selectedIds.length} selected records to the active crate.`);
  }, [activeCrateId, announce, selectedIds]);

  const hideFromRecs = useCallback(
    (id: string) => {
      setHiddenIds((prev) => new Set([...prev, id]));
      setUndoHideId(id);
      const track = tracks.find((t) => t.id === id);
      announce(
        `${track?.title ?? "Track"} hidden from recommendations. It stays in your library.`,
      );
    },
    [announce, tracks],
  );

  const undoHide = useCallback(() => {
    if (!undoHideId) return;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(undoHideId);
      return next;
    });
    announce("Hide undone. Track can appear in recommendations again.");
    setUndoHideId(null);
  }, [announce, undoHideId]);

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const resolvedQStatus: QStatus = !qOpen
    ? "collapsed"
    : qRequest === "loading"
      ? "loading"
      : qRequest === "failure"
        ? "failure"
        : qRequest === "no-results"
          ? "no-results"
          : selectedIds.length > 1
            ? "multi"
            : primarySelected || seed
              ? "track"
              : activeCrate?.trackIds.length
                ? "crate"
                : "empty";

  const value: StudioContextValue = {
    tracks,
    crates,
    modelVersion: MODEL_VERSION,
    filters,
    setFilters,
    clearFilters,
    filterCount,
    colorBy,
    setColorBy,
    visible,
    seed,
    seedIds: seedId ? [seedId] : [],
    setSeed,
    selectedIds,
    focusedId,
    primarySelected,
    selectTrack,
    focusTrack: setFocusedId,
    playing,
    playStatus,
    playheadSec,
    play,
    pause,
    togglePlay,
    seek,
    drawerOpen,
    openDrawer,
    closeDrawer,
    qOpen,
    qStatus: resolvedQStatus,
    qCards,
    qPrompt,
    setQPrompt,
    openQ,
    closeQ,
    toggleQ,
    askQ,
    activeCrateId,
    setActiveCrateId,
    activeCrate,
    addToCrate,
    density,
    setDensity,
    advancedOpen,
    setAdvancedOpen,
    mobileView,
    setMobileView,
    selectedCluster,
    setSelectedCluster,
    hiddenIds,
    hideFromRecs,
    undoHide,
    liveMessage: live.text,
    scoreFor,
    reasonsFor,
    candidates,
    webglOk,
    setWebglOk,
    howToReadOpen,
    setHowToReadOpen,
    librarySource,
    libraryName,
    libraryView,
    setLibraryView,
    playedIds,
    recentCount,
    unplayedCount,
    analysisReady,
    selectNearest,
    addSelectedToCrate,
  };

  return (
    <StudioContext.Provider value={value}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {live.text}
      </div>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}
