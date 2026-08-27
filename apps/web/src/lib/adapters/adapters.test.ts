import { describe, expect, it } from "vitest";
import { hasCloudUpload, hasLocalImport } from "@crate-dig/contracts";
import type { Track } from "@crate-dig/contracts";
import { CloudAdapter } from "./cloud-adapter";
import { AdapterError, normalizeAdapterError, unavailable } from "./errors";
import { LocalAdapter } from "./local-adapter";
import { MockAdapter } from "./mock-adapter";
import { createWebRuntime, resolveWebAppMode } from "./runtime";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("runtime selection", () => {
  it("requires an explicit app mode", () => {
    expect(() => resolveWebAppMode(undefined)).toThrow(/NEXT_PUBLIC_APP_MODE/);
    expect(() => resolveWebAppMode("desktop")).toThrow(/NEXT_PUBLIC_APP_MODE/);
    expect(resolveWebAppMode("local")).toBe("local");
    expect(resolveWebAppMode("preview")).toBe("preview");
  });

  it("composes mock, local, and cloud adapters without silent fallback", () => {
    const mock = createWebRuntime("mock");
    const local = createWebRuntime("local", { localApiUrl: "http://127.0.0.1:8000" });
    const cloud = createWebRuntime("cloud", { cloudApiUrl: "https://api.example" });

    expect(mock.adapter.runtime).toBe("mock");
    expect(local.adapter.runtime).toBe("local");
    expect(cloud.adapter.runtime).toBe("cloud");
    expect(hasLocalImport(mock.adapter)).toBe(true);
    expect(hasLocalImport(local.adapter)).toBe(true);
    expect(hasLocalImport(cloud.adapter)).toBe(false);
    expect(hasCloudUpload(mock.adapter)).toBe(false);
    expect(hasCloudUpload(local.adapter)).toBe(false);
    expect(hasCloudUpload(cloud.adapter)).toBe(true);
    expect((createWebRuntime("cloud").adapter as CloudAdapter).baseUrl).toBe("/api/cloud");
  });
});

describe("error normalization", () => {
  it("preserves adapter errors and wraps unknown failures", () => {
    const original = unavailable("Listing cloud tracks");
    expect(normalizeAdapterError(original)).toBe(original);
    const wrapped = normalizeAdapterError(new TypeError("Failed to fetch"), "LOCAL_API_UNAVAILABLE");
    expect(wrapped).toBeInstanceOf(AdapterError);
    expect(wrapped.code).toBe("LOCAL_API_UNAVAILABLE");
    expect(wrapped.retryable).toBe(false);
    expect(normalizeAdapterError("nope").message).toBe("The adapter request failed.");
  });
});

describe("MockAdapter", () => {
  it("serves fixture tracks and prototype-labeled neighbors", async () => {
    const adapter = new MockAdapter();
    const tracks = await adapter.listTracks({ limit: 8 });
    expect(tracks.length).toBeGreaterThan(0);
    const seed = tracks[0];
    if (!seed) throw new Error("expected a mock track");
    const neighbors = await adapter.getTrackNeighbors(seed.id, { limit: 3 });
    expect(neighbors[0]?.component).toBe("prototype-map-distance");
    expect(neighbors[0]?.evidence).toMatchObject({ nonSonic: true });
    expect(await adapter.getPlaybackUrl(seed.id)).toEqual({ url: "" });
    expect(hasLocalImport(adapter)).toBe(true);
    expect("createSignedUpload" in adapter).toBe(false);
  });

  it("loads an R2 preview catalog and requests signed playback", async () => {
    const adapter = new MockAdapter({
      catalogPath: "/api/preview/catalog",
      playbackPath: "/api/preview/playback",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/catalog")) {
          return jsonResponse({
            tracks: [
              {
                id: "r2-abc",
                title: "That Beat",
                artist: "Acrobat",
                bpm: 125,
                musicalKey: "9A",
                studio: {
                  key: "9A",
                  genre: "Progressive House",
                  mood: "euphoric",
                  energy: "peak",
                  energyScore: 7,
                  tags: ["Progressive House", "peak"],
                  analysisStatus: "ok",
                  previewState: "ready",
                },
              },
            ],
          });
        }
        if (url.includes("/playback") && url.includes("r2-abc")) {
          return jsonResponse({ url: "https://r2.example/signed", expiresAt: "t" });
        }
        return jsonResponse({}, 404);
      },
    });
    const libraries = await adapter.listLibraries();
    expect(libraries[0]?.source).toBe("demo");
    const tracks = await adapter.listTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: "r2-abc",
      title: "That Beat",
      artist: "Acrobat",
      bpm: 125,
      musicalKey: "9A",
      studio: { energy: "peak", mood: "euphoric", key: "9A" },
    });
    expect(await adapter.getPlaybackUrl("r2-abc")).toEqual({
      url: "https://r2.example/signed",
      expiresAt: "t",
    });
  });
});

describe("CloudAdapter", () => {
  it("returns explicit not-configured errors instead of fixture or local data", async () => {
    const adapter = new CloudAdapter({
      fetch: async () =>
        jsonResponse(
          {
            error: {
              code: "CLOUD_NOT_CONFIGURED",
              message: "Listing cloud tracks is unavailable because the cloud adapter is not configured.",
              retryable: false,
            },
          },
          503,
        ),
    });
    await expect(adapter.listTracks()).rejects.toMatchObject({
      code: "CLOUD_NOT_CONFIGURED",
      retryable: false,
    });
    await expect(adapter.getPlaybackUrl("trk")).rejects.toMatchObject({
      code: "CLOUD_NOT_CONFIGURED",
    });
    await expect(adapter.createSignedUpload({
      libraryId: "lib",
      fileName: "a.wav",
      contentType: "audio/wav",
      sizeBytes: 12,
    })).rejects.toMatchObject({ code: "CLOUD_NOT_CONFIGURED" });
    await expect(adapter.createAnalysisRun({
      libraryId: "lib",
      manifestName: "fast",
      manifestVersion: "1",
      mode: "fast",
      idempotencyKey: "k1",
    })).rejects.toMatchObject({ code: "CLOUD_NOT_CONFIGURED" });
    expect(hasLocalImport(adapter)).toBe(false);
    expect(hasCloudUpload(adapter)).toBe(true);
    expect("importFolder" in adapter).toBe(false);
  });

  it("keeps R2 playback-ready previewState when list tracks omit a signed URL", async () => {
    const adapter = new CloudAdapter({
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/tracks")) {
          return jsonResponse({
            tracks: [
              {
                id: "trk-r2",
                libraryId: "lib-demo",
                title: "Salt Flats",
                artist: "Demo",
                previewUrl: null,
                studio: { previewState: "ready", analysisStatus: "ok" },
              },
            ],
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });
    const tracks = await adapter.listTracks();
    expect(tracks[0]?.previewUrl).toBeNull();
    expect(
      (tracks[0] as Track & { studio?: { previewState?: string } }).studio,
    ).toMatchObject({ previewState: "ready" });
  });

  it("never falls back to mock tracks and requests librosa-zscore-v1 neighbors", async () => {
    const calls: string[] = [];
    const adapter = new CloudAdapter({
      baseUrl: "https://api.example/cloud",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/libraries")) {
          return jsonResponse({ libraries: [] });
        }
        if (url.endsWith("/tracks")) {
          return jsonResponse({ tracks: [] });
        }
        if (url.includes("/neighbors")) {
          return jsonResponse(
            {
              error: {
                code: "CLOUD_NOT_CONFIGURED",
                message: "Loading cloud recommendations is unavailable because the cloud adapter is not configured.",
                retryable: false,
              },
            },
            503,
          );
        }
        if (url.endsWith("/uploads")) {
          return jsonResponse({
            uploadId: "up-1",
            objectKey: "libraries/lib/originals/up-1/a.wav",
            url: "https://r2.example/put",
            method: "PUT",
            headers: { "Content-Type": "audio/wav" },
            expiresAt: "2026-08-26T00:15:00Z",
          });
        }
        if (url.endsWith("/playback")) {
          return jsonResponse({
            url: "https://r2.example/get",
            expiresAt: "2026-08-26T00:10:00Z",
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });

    await expect(adapter.listTracks()).resolves.toEqual([]);
    await expect(adapter.listLibraries()).resolves.toEqual([]);
    await expect(adapter.getPlaybackUrl("trk-1")).resolves.toEqual({
      url: "https://r2.example/get",
      expiresAt: "2026-08-26T00:10:00Z",
    });
    await expect(adapter.createSignedUpload({
      libraryId: "lib",
      fileName: "a.wav",
      contentType: "audio/wav",
      sizeBytes: 12,
    })).resolves.toMatchObject({
      uploadId: "up-1",
      url: "https://r2.example/put",
      method: "PUT",
    });
    await expect(adapter.getTrackNeighbors("trk-1")).rejects.toMatchObject({
      code: "CLOUD_NOT_CONFIGURED",
    });
    expect(calls.some((call) => call.includes("/neighbors?channel=librosa-zscore-v1"))).toBe(true);
    expect(calls.every((call) => !call.includes("127.0.0.1"))).toBe(true);
  });
});

describe("LocalAdapter", () => {
  it("wraps the FastAPI library, import, neighbor, and playback contract", async () => {
    const calls: string[] = [];
    const adapter = new LocalAdapter({
      baseUrl: "http://127.0.0.1:8000/",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/health")) {
          return jsonResponse({ ok: true, ffmpeg: true, home: "/tmp", host: "127.0.0.1" });
        }
        if (url.endsWith("/libraries")) {
          return jsonResponse({
            libraries: [
              {
                id: "lib-1",
                name: "Jeff USB",
                source: "folder",
                created_at: "2026-08-15T00:00:00Z",
                updated_at: "2026-08-15T00:00:00Z",
              },
            ],
          });
        }
        if (url.includes("/analysis")) {
          return jsonResponse({
            track_id: "trk-1",
            run_id: "run-1",
            state: null,
            stages: [{ status: "succeeded" }],
            features: [{ feature_key: "tempo.bpm:track", value: 122 }],
            embeddings: [{ embedding_key: "retrieval:track", dimensions: 8 }],
          });
        }
        if (url.endsWith("/tracks")) {
          return jsonResponse({
            tracks: [
              {
                id: "trk-1",
                library_id: "lib-1",
                title: "Dancing Stuff",
                artist: "Massiande",
                album: "",
                genre: "House",
                label: "",
                bpm: 122,
                key: "7A",
                bpm_source: null,
                key_source: null,
                duration_sec: 320,
                location: "/Music/dancing-stuff.wav",
                location_kind: "local",
                missing: false,
                created_at: "2026-08-15T00:00:00Z",
                date_added: "2026-08-15T00:00:00Z",
                preview_url: "/audio/trk-1",
                rating: null,
                rekordbox_track_id: null,
                audio_content_hash: null,
              },
            ],
          });
        }
        if (url.includes("/neighbors")) {
          return jsonResponse({
            track_id: "trk-1",
            run_id: "run-1",
            channel: "librosa-zscore-v1",
            limit: 8,
            neighbors: [
              {
                track_id: "trk-2",
                rank: 1,
                score: 0.91,
                channel: "librosa-zscore-v1",
                distance: 0.12,
                reason_codes: ["groove"],
              },
            ],
          });
        }
        if (url.endsWith("/imports/folder")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            folder_path?: string;
            library_name?: string;
          };
          expect(body.folder_path).toBe("/Music");
          expect(body.library_name).toBe("Local Music");
          return jsonResponse({
            library_id: "lib-1",
            scanned: 1,
            examined: 1,
            tracks: 1,
            outcomes: [
              {
                path: "/Music/dancing-stuff.wav",
                track_id: "trk-1",
                status: "imported",
                warnings: [],
              },
            ],
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });

    await expect(adapter.health()).resolves.toEqual({ ok: true, runtime: "local" });
    const tracks = await adapter.listTracks();
    expect(tracks[0]?.title).toBe("Dancing Stuff");
    expect(tracks[0]?.previewUrl).toBe("http://127.0.0.1:8000/audio/trk-1");
    expect(tracks[0]?.readiness).toBe("ready_fast");
    expect(
      (tracks[0] as Track & { studio?: { analysisStatus?: string; previewState?: string } }).studio,
    ).toMatchObject({ analysisStatus: "ok", previewState: "ready" });
    expect(await adapter.getPlaybackUrl("trk-1")).toEqual({
      url: "http://127.0.0.1:8000/audio/trk-1",
    });
    const neighbors = await adapter.getTrackNeighbors("trk-1");
    expect(neighbors).toEqual([
      {
        trackId: "trk-2",
        score: 0.91,
        component: "librosa-zscore-v1",
        evidence: {
          rank: 1,
          distance: 0.12,
          components: undefined,
          reasonCodes: ["groove"],
          channel: "librosa-zscore-v1",
          runId: "run-1",
        },
      },
    ]);
    const imported = await adapter.importFolder({ folderPath: "/Music" });
    expect(imported.libraryId).toBe("lib-1");
    expect(imported.outcomes[0]?.status).toBe("imported");
    expect(hasLocalImport(adapter)).toBe(true);
    expect(hasCloudUpload(adapter)).toBe(false);
    expect(calls.some((call) => call.includes("http://127.0.0.1:8000/tracks"))).toBe(true);
    expect(
      calls.some((call) =>
        call.includes("/neighbors?channel=librosa-zscore-v1"),
      ),
    ).toBe(true);
  });

  it("maps analysis-run evidence and does not mark null preview URLs ready", async () => {
    const adapter = new LocalAdapter({
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/analysis-runs/run-1/tracks")) {
          return jsonResponse({
            run_id: "run-1",
            tracks: [
              {
                id: "trk-failed",
                track_id: "trk-failed",
                status: "failed",
                stages_total: 1,
                stages_done: 1,
                stages_running: 0,
                stages_failed: 1,
              },
            ],
          });
        }
        if (url.endsWith("/tracks")) {
          return jsonResponse({
            tracks: [
              {
                id: "trk-pending",
                library_id: "lib-1",
                title: "Queued Cut",
                artist: "Local DJ",
                album: "",
                genre: "",
                label: "",
                bpm: null,
                key: null,
                bpm_source: null,
                key_source: null,
                duration_sec: null,
                location: "/Music/queued.wav",
                location_kind: "local",
                missing: false,
                created_at: "2026-08-15T00:00:00Z",
                date_added: "2026-08-15T00:00:00Z",
                preview_url: null,
                rating: null,
                rekordbox_track_id: null,
                audio_content_hash: null,
              },
              {
                id: "trk-missing-meta",
                library_id: "lib-1",
                title: "Untitled cassette",
                artist: "",
                album: "",
                genre: "",
                label: "",
                bpm: null,
                key: null,
                bpm_source: null,
                key_source: null,
                duration_sec: null,
                location: "/Music/untitled.wav",
                location_kind: "local",
                missing: false,
                created_at: "2026-08-15T00:00:00Z",
                date_added: "2026-08-15T00:00:00Z",
                preview_url: "/audio/trk-missing-meta",
                rating: null,
                rekordbox_track_id: null,
                audio_content_hash: null,
              },
              {
                id: "trk-failed",
                library_id: "lib-1",
                title: "Broken Decode",
                artist: "Local DJ",
                album: "",
                genre: "",
                label: "",
                bpm: 120,
                key: null,
                bpm_source: null,
                key_source: null,
                duration_sec: 180,
                location: "/Music/broken.wav",
                location_kind: "local",
                missing: false,
                created_at: "2026-08-15T00:00:00Z",
                date_added: "2026-08-15T00:00:00Z",
                preview_url: "/audio/trk-failed",
                rating: null,
                rekordbox_track_id: null,
                audio_content_hash: null,
              },
            ],
          });
        }
        if (url.includes("/trk-pending/analysis")) {
          return jsonResponse({
            track_id: "trk-pending",
            run_id: "run-1",
            stages: [{ status: "queued" }],
            features: [],
            embeddings: [],
          });
        }
        if (url.includes("/trk-missing-meta/analysis")) {
          return jsonResponse({
            track_id: "trk-missing-meta",
            run_id: null,
            stages: [],
            features: [],
            embeddings: [],
          });
        }
        if (url.includes("/trk-failed/analysis")) {
          return jsonResponse({
            track_id: "trk-failed",
            run_id: "run-1",
            stages: [{ status: "failed" }],
            features: [],
            embeddings: [],
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });

    const tracks = await adapter.listTracks();
    const pending = tracks.find((track) => track.id === "trk-pending");
    const missingMeta = tracks.find((track) => track.id === "trk-missing-meta");
    const failed = tracks.find((track) => track.id === "trk-failed");
    expect(pending?.readiness).toBe("queued");
    expect((pending as Track & { studio?: { analysisStatus?: string; previewState?: string } }).studio).toMatchObject({
      analysisStatus: "pending",
      previewState: "missing",
    });
    expect(missingMeta?.readiness).toBe("imported");
    expect((missingMeta as Track & { studio?: { analysisStatus?: string } }).studio).toMatchObject({
      analysisStatus: "missing-metadata",
    });
    expect(failed?.readiness).toBe("failed");
    expect((failed as Track & { studio?: { analysisStatus?: string } }).studio).toMatchObject({
      analysisStatus: "failed",
    });
    const runTracks = await adapter.listAnalysisRunTracks("run-1");
    expect(runTracks).toEqual([
      { trackId: "trk-failed", runId: "run-1", readiness: "failed" },
    ]);
  });

  it("normalizes transport failures without falling back to mock data", async () => {
    const adapter = new LocalAdapter({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(adapter.listTracks()).rejects.toMatchObject({
      code: "LOCAL_API_UNAVAILABLE",
    });
  });
});
