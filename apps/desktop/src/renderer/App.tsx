import { useCallback, useEffect, useMemo, useState } from "react";
import {
  displaySimilarityReasons,
  mapTrackToStudio,
  previewStateFromUrl,
} from "@crate-dig/app-core";
import type { ImportResult, Neighbor, Track } from "@crate-dig/contracts";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import { uiPackageBoundary, type SurfaceState } from "@crate-dig/ui";
import type { CloudSyncState, SidecarSnapshot } from "../shared/native-api";
import { createDesktopRuntime } from "./adapter/runtime";
import { normalizeAdapterError } from "./adapter/errors";

export function App() {
  const native = window.crateDig;
  const [sidecar, setSidecar] = useState<SidecarSnapshot | null>(null);
  const [cloud, setCloud] = useState<CloudSyncState | null>(null);
  const [tracks, setTracks] = useState<readonly Track[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<readonly Neighbor[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [surface, setSurface] = useState<SurfaceState>({ busy: false });

  const adapter = useMemo(() => {
    const baseUrl = sidecar?.baseUrl;
    if (!baseUrl || !native) return null;
    return createDesktopRuntime({
      localApiUrl: baseUrl,
      getAuthSession: async () => (await native.getCloudSyncState()).session,
    }).adapter;
  }, [native, sidecar?.baseUrl]);

  const refreshLibrary = useCallback(async () => {
    if (!adapter) return;
    try {
      setTracks(await adapter.listTracks({ limit: 80 }));
    } catch (error) {
      setSurface({ busy: false, message: normalizeAdapterError(error).message });
    }
  }, [adapter]);

  useEffect(() => {
    if (!native) return;
    void native.getSidecarStatus().then(setSidecar);
    void native.getCloudSyncState().then(setCloud);
    return native.onSidecarStatus(setSidecar);
  }, [native]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  if (!native) {
    return (
      <main className="app">
        <p className="warn">This window is missing the desktop preload bridge.</p>
      </main>
    );
  }

  const selected = tracks.find((track) => track.id === selectedId) ?? null;
  const selectedStudio = selected ? mapTrackToStudio(selected) : null;

  async function importFolder() {
    const folderPath = await native.chooseFolder();
    if (!folderPath || !adapter) return;
    setSurface({ busy: true, message: "Indexing folder…" });
    try {
      const result = await adapter.importFolder({ folderPath });
      setImportResult(result);
      setSurface({
        busy: false,
        message: `Indexed ${result.outcomes.filter((item) => item.status === "imported").length} files. Audio stays on disk.`,
      });
      await refreshLibrary();
    } catch (error) {
      const mapped = normalizeAdapterError(error);
      setSurface({
        busy: false,
        message:
          mapped.code === "LOCAL_API_UNAVAILABLE"
            ? "Sidecar is offline. Folder import needs the local API on loopback, not cloud."
            : mapped.message,
      });
    }
  }

  async function selectTrack(track: Track) {
    if (!adapter) return;
    setSelectedId(track.id);
    setNeighbors([]);
    setPlaybackUrl(null);
    try {
      const [playback, nextNeighbors] = await Promise.all([
        adapter.getPlaybackUrl(track.id),
        adapter.getTrackNeighbors(track.id, {
          channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
          limit: 8,
        }),
      ]);
      setPlaybackUrl(playback.url);
      setNeighbors(nextNeighbors);
    } catch (error) {
      setSurface({ busy: false, message: normalizeAdapterError(error).message });
    }
  }

  async function analyzeSelected() {
    if (!adapter || !selected) return;
    setSurface({ busy: true, message: "Queueing local-fast@1…" });
    try {
      const run = await adapter.createAnalysisRun({
        libraryId: selected.libraryId,
        manifestName: "local-fast",
        manifestVersion: "1",
        mode: "fast",
        idempotencyKey: `desktop-${selected.libraryId}-${Date.now()}`,
      });
      const worker = await native.launchWorker(run.id);
      setSurface({
        busy: false,
        message:
          worker.status === "running"
            ? `Worker pid ${worker.pid} is draining run ${run.id}.`
            : worker.status === "error"
              ? worker.message
              : "Analysis run queued.",
      });
    } catch (error) {
      setSurface({ busy: false, message: normalizeAdapterError(error).message });
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="brand">Crate Dig</p>
          <p className="sub">
            Desktop runtime · {uiPackageBoundary} · neighbors use {LOCAL_ANALYSIS_NEIGHBOR_CHANNEL}
          </p>
        </div>
        <div>
          <p className={sidecar?.status === "healthy" ? "ok" : "warn"}>
            Sidecar {sidecar?.status ?? "starting"}
            {sidecar?.baseUrl ? ` · ${sidecar.baseUrl}` : ""}
          </p>
          <p className="muted">
            Home {sidecar?.home ?? "unresolved"} ({sidecar?.homeKind ?? "n/a"})
          </p>
        </div>
      </header>
      <div className="layout">
        <section className="panel">
          <h2>Local library</h2>
          <p className="muted">
            Folder import and playback talk to the loopback API. Networking can stay off.
          </p>
          <div className="row">
            <button type="button" onClick={() => void importFolder()} disabled={surface.busy}>
              Choose folder
            </button>
            <button className="secondary" type="button" onClick={() => void native.restartSidecar()}>
              Restart sidecar
            </button>
          </div>
          {importResult ? (
            <p>
              Library {importResult.libraryId}: {importResult.outcomes.length} outcomes.
            </p>
          ) : null}
          <h2>Optional cloud sync</h2>
          <p className="muted">
            Off by default. Enabling it is the only path that may contact Supabase. No service-role
            key is loaded here.
          </p>
          <div className="row">
            <button
              className="secondary"
              type="button"
              onClick={async () => setCloud(await native.setCloudSyncEnabled(!(cloud?.enabled)))}
            >
              {cloud?.enabled ? "Disable cloud sync" : "Enable cloud sync"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={!cloud?.enabled}
              onClick={async () => setCloud(await native.signInWithCloud())}
            >
              Sign in
            </button>
            <button className="secondary" type="button" onClick={async () => setCloud(await native.signOutCloud())}>
              Sign out
            </button>
          </div>
          <p className="muted">{cloud?.message}</p>
          {cloud?.session ? (
            <p>Signed in as {cloud.session.email ?? cloud.session.userId}</p>
          ) : (
            <p className="muted">No cloud session.</p>
          )}
        </section>
        <section className="panel">
          <h2>Tracks</h2>
          {tracks.length === 0 ? <p className="muted">No local tracks yet.</p> : null}
          <ul className="tracks">
            {tracks.map((track) => {
              const studio = mapTrackToStudio(track);
              return (
                <li
                  key={track.id}
                  aria-selected={track.id === selectedId}
                  onClick={() => void selectTrack(track)}
                >
                  <strong>{track.title}</strong>
                  <div className="muted">
                    {track.artist} · {track.readiness ?? "imported"} · preview {studio.previewState}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel">
          <h2>Selection</h2>
          {selectedStudio ? (
            <>
              <p>
                {selectedStudio.title}
                <br />
                <span className="muted">
                  readiness {selectedStudio.readiness ?? "imported"} · preview{" "}
                  {previewStateFromUrl(selectedStudio.previewUrl)}
                </span>
              </p>
              <div className="row">
                <button type="button" onClick={() => void analyzeSelected()}>
                  Analyze with worker
                </button>
                <button className="secondary" type="button" onClick={() => void native.stopWorker()}>
                  Stop worker
                </button>
              </div>
              <h2>Neighbors</h2>
              {neighbors.length === 0 ? (
                <p className="muted">
                  No {LOCAL_ANALYSIS_NEIGHBOR_CHANNEL} neighbors yet. Missing analysis is left empty
                  rather than filled with invented sonic copy.
                </p>
              ) : (
                <ul>
                  {neighbors.map((neighbor) => (
                    <li key={neighbor.trackId}>
                      {neighbor.trackId} · {displaySimilarityReasons(neighbor).map((reason) => reason.label).join(" · ") || "score only"}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">
                Q is not part of this desktop scaffold, so it does not invent crate or similarity copy.
              </p>
            </>
          ) : (
            <p className="muted">Select a track to play and inspect neighbors.</p>
          )}
        </section>
      </div>
      <footer className="player">
        <div className="status">{surface.message}</div>
        {playbackUrl ? (
          <audio controls src={playbackUrl} preload="metadata">
            Local playback
          </audio>
        ) : (
          <p className="muted">Playback uses the sidecar Range endpoint when a preview URL exists.</p>
        )}
      </footer>
    </div>
  );
}
