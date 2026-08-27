import { describe, expect, it } from "vitest";
import { hasCloudUpload, hasLocalImport, LOCAL_ANALYSIS_NEIGHBOR_CHANNEL } from "@crate-dig/contracts";
import type { Track } from "@crate-dig/contracts";
import { previewStateFromUrl } from "@crate-dig/app-core";
import { DesktopAdapter } from "../renderer/adapter/desktop-adapter";
import { createDesktopRuntime } from "../renderer/adapter/runtime";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("desktop runtime composition", () => {
  it("advertises desktop + local import and optional auth, never cloud upload", () => {
    const runtime = createDesktopRuntime({
      localApiUrl: "http://127.0.0.1:8000",
      getAuthSession: async () => null,
    });
    expect(runtime.adapter.runtime).toBe("desktop");
    expect(hasLocalImport(runtime.adapter)).toBe(true);
    expect(hasCloudUpload(runtime.adapter)).toBe(false);
    expect("getAuthSession" in runtime.adapter).toBe(true);
  });
});

describe("DesktopAdapter", () => {
  it("uses loopback HTTP and always sends the versioned neighbor channel", async () => {
    const calls: string[] = [];
    const adapter = new DesktopAdapter({
      baseUrl: "http://127.0.0.1:8000/",
      getAuthSession: async () => ({ userId: "user-1", email: "dj@example.com" }),
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/health")) {
          return jsonResponse({ ok: true, ffmpeg: true, home: "/tmp/crate-dig", host: "127.0.0.1" });
        }
        if (url.endsWith("/libraries")) {
          return jsonResponse({
            libraries: [
              {
                id: "lib-1",
                name: "Local Music",
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
            channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
            limit: 8,
            neighbors: [
              {
                track_id: "trk-2",
                rank: 1,
                score: 0.91,
                channel: LOCAL_ANALYSIS_NEIGHBOR_CHANNEL,
                distance: 0.12,
                reason_codes: ["groove"],
              },
            ],
          });
        }
        if (url.endsWith("/imports/folder")) {
          return jsonResponse({
            library_id: "lib-1",
            scanned: 1,
            examined: 1,
            tracks: 1,
            outcomes: [{ path: "/Music/dancing-stuff.wav", track_id: "trk-1", status: "imported", warnings: [] }],
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });

    await expect(adapter.health()).resolves.toEqual({ ok: true, runtime: "local" });
    await expect(adapter.getAuthSession()).resolves.toEqual({
      userId: "user-1",
      email: "dj@example.com",
    });
    const tracks = await adapter.listTracks();
    expect(tracks[0]?.previewUrl).toBe("http://127.0.0.1:8000/audio/trk-1");
    expect(tracks[0]?.readiness).toBe("ready_fast");
    expect(
      (tracks[0] as Track & { studio?: { previewState?: string } }).studio,
    ).toMatchObject({ previewState: "ready" });
    const neighbors = await adapter.getTrackNeighbors("trk-1");
    expect(neighbors[0]?.component).toBe(LOCAL_ANALYSIS_NEIGHBOR_CHANNEL);
    expect(
      calls.some((call) => call.includes(`/neighbors?channel=${LOCAL_ANALYSIS_NEIGHBOR_CHANNEL}`)),
    ).toBe(true);
    const imported = await adapter.importFolder({ folderPath: "/Music" });
    expect(imported.libraryId).toBe("lib-1");
  });

  it("does not mark a missing preview ready", async () => {
    const adapter = new DesktopAdapter({
      fetch: async (input) => {
        const url = String(input);
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
            ],
          });
        }
        if (url.includes("/analysis")) {
          return jsonResponse({
            track_id: "trk-pending",
            stages: [{ status: "queued" }],
            features: [],
            embeddings: [],
          });
        }
        return jsonResponse({ detail: "missing" }, 404);
      },
    });
    const tracks = await adapter.listTracks();
    expect(tracks[0]?.readiness).toBe("queued");
    expect(previewStateFromUrl(tracks[0]?.previewUrl)).toBe("missing");
    expect(
      (tracks[0] as Track & { studio?: { previewState?: string; analysisStatus?: string } }).studio,
    ).toMatchObject({ previewState: "missing", analysisStatus: "pending" });
  });
});
