import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogSqlite, writeCatalogSqlite } from "./catalog-sqlite";

describe("catalog sqlite snapshot", () => {
  it("round-trips libraries, tracks, and playback keys", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "crate-dig-catalog-"));
    const filePath = path.join(dir, "demo-catalog.sqlite");
    try {
      writeCatalogSqlite(
        "genre-pack-v2",
        {
          libraries: [{ id: "lib-1", name: "Crate Dig demo", source: "demo" }],
          tracks: [
            {
              id: "trk-1",
              libraryId: "lib-1",
              title: "That Beat",
              artist: "Acrobat",
              bpm: 125,
            },
          ],
          objectKeys: new Map([["trk-1", "demo/originals/Acrobat - That Beat.mp3"]]),
        },
        filePath,
      );
      const snapshot = readCatalogSqlite("genre-pack-v2", filePath);
      expect(snapshot?.libraries[0]?.name).toBe("Crate Dig demo");
      expect(snapshot?.tracks).toHaveLength(1);
      expect(snapshot?.tracks[0]).toMatchObject({ id: "trk-1", title: "That Beat" });
      expect(snapshot?.objectKeys.get("trk-1")).toBe("demo/originals/Acrobat - That Beat.mp3");
      expect(readCatalogSqlite("other-layout", filePath)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
