import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Library, Track } from "@crate-dig/contracts";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all: (...params: unknown[]) => Record<string, unknown>[];
    run: (...params: unknown[]) => unknown;
  };
  close(): void;
};

export type CatalogSnapshot = {
  libraries: Library[];
  tracks: Track[];
  objectKeys: Map<string, string>;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS catalog_snapshot (
    layout_version TEXT PRIMARY KEY,
    library_json TEXT NOT NULL,
    tracks_json TEXT NOT NULL,
    keys_json TEXT NOT NULL,
    saved_at TEXT NOT NULL
  );
`;

function webDataDir(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "src/data/preview-track-studio.json"))) {
    return path.join(cwd, "src/data");
  }
  return path.join(cwd, "apps/web/src/data");
}

export function demoCatalogSqlitePath(): string {
  const configured = process.env.DEMO_CATALOG_SQLITE_PATH?.trim();
  if (configured) return configured;
  if (process.env.VERCEL) return path.join("/tmp", "demo-catalog.sqlite");
  return path.join(webDataDir(), "demo-catalog.sqlite");
}

export function catalogSqliteAvailable(filePath = demoCatalogSqlitePath()): boolean {
  return existsSync(filePath);
}

function openSqlite(filePath: string, readOnly: boolean): SqliteDatabase {
  const sqlite = process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(filePath, { readOnly });
}

export function readCatalogSqlite(
  layoutVersion: string,
  filePath = demoCatalogSqlitePath(),
): CatalogSnapshot | null {
  if (!existsSync(filePath)) return null;
  const database = openSqlite(filePath, true);
  try {
    const row = database
      .prepare(
        `select library_json as libraryJson, tracks_json as tracksJson, keys_json as keysJson
         from catalog_snapshot where layout_version = ?`,
      )
      .all(layoutVersion)[0];
    if (!row) return null;
    const libraries = parseJson<Library[]>(row.libraryJson ?? row.library_json, []);
    const tracks = parseJson<Track[]>(row.tracksJson ?? row.tracks_json, []);
    const keys = parseJson<Record<string, string>>(row.keysJson ?? row.keys_json, {});
    if (!tracks.length) return null;
    return {
      libraries,
      tracks,
      objectKeys: new Map(Object.entries(keys)),
    };
  } catch {
    return null;
  } finally {
    database.close();
  }
}

export function writeCatalogSqlite(
  layoutVersion: string,
  snapshot: CatalogSnapshot,
  filePath = demoCatalogSqlitePath(),
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const database = openSqlite(filePath, false);
  try {
    database.exec(SCHEMA);
    database
      .prepare(
        `insert or replace into catalog_snapshot
         (layout_version, library_json, tracks_json, keys_json, saved_at)
         values (?, ?, ?, ?, ?)`,
      )
      .run(
        layoutVersion,
        JSON.stringify(snapshot.libraries),
        JSON.stringify(snapshot.tracks),
        JSON.stringify(Object.fromEntries(snapshot.objectKeys)),
        new Date().toISOString(),
      );
  } finally {
    database.close();
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
