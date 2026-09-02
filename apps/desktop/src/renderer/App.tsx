import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bpmBoundsFromTracks,
  mapTrackToStudio,
  type StudioFilters,
  type StudioTrack,
} from "@crate-dig/app-core";
import type { ImportResult, Neighbor, ProjectionPoint, Track } from "@crate-dig/contracts";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import type { CloudSyncState, SidecarSnapshot } from "../shared/native-api";
import { createDesktopRuntime } from "./adapter/runtime";
import { normalizeAdapterError } from "./adapter/errors";
import { FilterRail } from "./studio/FilterRail";
import { MapField } from "./studio/MapField";
import { PlayerBar } from "./studio/PlayerBar";
import { QDock } from "./studio/QDock";
import { RecordsTable } from "./studio/RecordsTable";
import { TopBar } from "./studio/TopBar";
import {
  EMPTY_FILTERS,
  filterLibrary,
  qDockState,
  visibleStudioTracks,
  type LibraryView,
} from "./studio/view";

export function App() {
  const native = window.crateDig;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sidecar, setSidecar] = useState<SidecarSnapshot | null>(null);
  const [cloud, setCloud] = useState<CloudSyncState | null>(null);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [projectionById, setProjectionById] = useState<Map<string, ProjectionPoint>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<readonly Neighbor[]>([]);
  const [listening, setListening] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<StudioFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<LibraryView>("all");
  const [lasso, setLasso] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptMessage, setPromptMessage] = useState<string>();
  const [surfaceMessage, setSurfaceMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const runtime = useMemo(() => {
    const baseUrl = sidecar?.baseUrl;
    if (!baseUrl || !native) return null;
    return createDesktopRuntime({
      localApiUrl: baseUrl,
      getAuthSession: async () => (await native.getCloudSyncState()).session,
    });
  }, [native, sidecar?.baseUrl]);
  const adapter = runtime?.adapter ?? null;

  const studioTracks = useMemo(
    () => tracks.map((track) => mapTrackToStudio(track, projectionById.get(track.id))),
    [tracks, projectionById],
  );
  const bounds = useMemo(() => bpmBoundsFromTracks(studioTracks), [studioTracks]);
  const selected = studioTracks.find((track) => track.id === selectedId) ?? null;
  const visible = useMemo(
    () => visibleStudioTracks(studioTracks, filters, selected, view, playedIds, bounds),
    [studioTracks, filters, selected, view, playedIds, bounds],
  );
  const qState = qDockState({
    trackCount: studioTracks.length,
    selected,
    neighbors,
    listening,
    channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
  });

  const refreshLibrary = useCallback(async () => {
    if (!adapter) return;
    try {
      const [records, feed] = await Promise.all([
        adapter.listTracks(),
        runtime?.projection?.getProjectionMapFeed().catch(() => undefined),
      ]);
      setTracks(records);
      setProjectionById(
        new Map(feed?.points.map((point) => [point.trackId, point]) ?? []),
      );
    } catch (error) {
      setSurfaceMessage(normalizeAdapterError(error).message);
    }
  }, [adapter, runtime?.projection]);

  useEffect(() => {
    if (!native) return;
    void native.getSidecarStatus().then(setSidecar);
    void native.getCloudSyncState().then(setCloud);
    return native.onSidecarStatus(setSidecar);
  }, [native]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
    };
  }, [playbackUrl]);

  if (!native) {
    return (
      <main className="app">
        <p className="warn">This window is missing the desktop preload bridge.</p>
      </main>
    );
  }

  async function importFolder() {
    const folderPath = await native.chooseFolder();
    if (!folderPath || !adapter) return;
    setBusy(true);
    setSurfaceMessage("Indexing folder…");
    try {
      const result = await adapter.importFolder({ folderPath });
      setImportResult(result);
      setSurfaceMessage(
        `Indexed ${result.outcomes.filter((item) => item.status === "imported").length} files. Audio stays on disk.`,
      );
      await refreshLibrary();
    } catch (error) {
      const mapped = normalizeAdapterError(error);
      setSurfaceMessage(
        mapped.code === "LOCAL_API_UNAVAILABLE"
          ? "Sidecar is offline. Folder import needs the local API on loopback, not cloud."
          : mapped.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectTrack(track: StudioTrack) {
    if (!adapter) return;
    setSelectedId(track.id);
    setNeighbors([]);
    setListening(true);
    setPlaybackUrl(null);
    setPlaying(false);
    try {
      const [playback, nextNeighbors] = await Promise.all([
        adapter.getPlaybackUrl(track.id),
        adapter.getTrackNeighbors(track.id, {
          channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
          limit: 18,
        }),
      ]);
      setPlaybackUrl(playback.url);
      setNeighbors(nextNeighbors);
    } catch (error) {
      setSurfaceMessage(normalizeAdapterError(error).message);
    } finally {
      setListening(false);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !selected) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlayedIds((current) => new Set(current).add(selected.id));
      } catch (error) {
        setSurfaceMessage(normalizeAdapterError(error).message);
      }
    } else {
      audio.pause();
    }
  }

  const sidecarOk = sidecar?.status === "healthy";
  const sidecarLabel = sidecarOk
    ? `Sidecar healthy`
    : `Sidecar ${sidecar?.status ?? "starting"}`;

  return (
    <div className="app">
      <TopBar
        query={filters.query}
        onQuery={(query) => setFilters({ ...filters, query })}
        lasso={lasso}
        onLasso={() => setLasso((value) => !value)}
        sidecarLabel={sidecarLabel}
        sidecarOk={sidecarOk}
        onAskQ={() => {
          setPromptMessage("Desktop Q uses local neighbors after analysis. It does not generate crate copy.");
        }}
      />
      <div className="shell">
        <FilterRail
          trackCount={studioTracks.length}
          recentCount={filterLibrary(studioTracks, "recent", playedIds).length}
          unplayedCount={filterLibrary(studioTracks, "unplayed", playedIds).length}
          view={view}
          onView={setView}
          filters={filters}
          onFilters={setFilters}
          bpmLo={bounds.min}
          bpmHi={bounds.max}
          localOnly={!cloud?.enabled}
          cloudEnabled={Boolean(cloud?.enabled)}
          cloudMessage={cloud?.message}
          busy={busy}
          onImport={() => void importFolder()}
          onRestartSidecar={() => void native.restartSidecar()}
          onToggleCloud={async () => setCloud(await native.setCloudSyncEnabled(!cloud?.enabled))}
          onSignIn={async () => setCloud(await native.signInWithCloud())}
          onSignOut={async () => setCloud(await native.signOutCloud())}
        />
        <div className="stage">
          <MapField
            tracks={visible}
            selected={selected}
            playingId={playing ? selected?.id ?? null : null}
            onSelect={(track) => void selectTrack(track)}
          />
          <RecordsTable
            tracks={visible}
            selectedId={selectedId}
            neighbors={neighbors}
            onSelect={(track) => void selectTrack(track)}
          />
        </div>
        <QDock
          state={qState}
          neighbors={neighbors}
          prompt={prompt}
          onPrompt={setPrompt}
          promptMessage={promptMessage}
          onAsk={() => {
            setPrompt("");
            setPromptMessage(
              prompt.trim()
                ? "Q on desktop does not answer in generated paragraphs. Select a record to load sidecar neighbors."
                : "Ask after a track is selected. Neighbors come from the local API.",
            );
          }}
        />
      </div>
      <PlayerBar
        track={selected}
        playing={playing}
        currentTime={currentTime}
        status={
          surfaceMessage ??
          (importResult
            ? `Library ${importResult.libraryId}: ${importResult.outcomes.length} outcomes`
            : sidecar?.home
              ? `Home ${sidecar.home}`
              : "Playback uses the sidecar Range endpoint")
        }
        onToggle={() => void togglePlayback()}
        onSeek={(seconds) => {
          if (audioRef.current) audioRef.current.currentTime = seconds;
        }}
      />
      {playbackUrl ? <audio ref={audioRef} src={playbackUrl} preload="metadata" hidden /> : <audio ref={audioRef} hidden />}
    </div>
  );
}
