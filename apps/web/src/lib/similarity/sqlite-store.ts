import { existsSync } from "node:fs";
import path from "node:path";
import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL, type Neighbor } from "@crate-dig/contracts";

export function demoSimilaritySqlitePath(): string {
  const configured = process.env.SIMILARITY_SQLITE_PATH?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "src/data/demo-similarity.sqlite");
}

type SqliteDatabase = {
  prepare(sql: string): { all: (...params: unknown[]) => Record<string, unknown>[] };
  close(): void;
};

function openSqlite(filePath: string): SqliteDatabase {
  const sqlite = process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(filePath, { readOnly: true });
}

export function sqliteNeighborsAvailable(filePath = demoSimilaritySqlitePath()): boolean {
  return existsSync(filePath);
}

export function listSqliteNeighbors(
  trackId: string,
  options: { limit?: number; channel?: string; filePath?: string } = {},
): Neighbor[] {
  const filePath = options.filePath ?? demoSimilaritySqlitePath();
  if (!existsSync(filePath)) return [];
  const limit = Math.min(Math.max(options.limit ?? 80, 1), 200);
  const channel = options.channel ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL;
  const database = openSqlite(filePath);
  try {
    const rows = database
      .prepare(
        `select target_track_id as trackId, rank, score, distance, channel
         from similarity_neighbors
         where source_track_id = ? and channel = ?
         order by rank
         limit ?`,
      )
      .all(trackId, channel, limit);
    return rows.flatMap((row) => {
      const id = typeof row.trackId === "string" ? row.trackId : null;
      const score = typeof row.score === "number" ? row.score : Number(row.score);
      if (!id || !Number.isFinite(score)) return [];
      return [
        {
          trackId: id,
          score,
          component: typeof row.channel === "string" ? row.channel : channel,
          evidence: {
            rank: Number(row.rank) || undefined,
            distance: typeof row.distance === "number" ? row.distance : undefined,
            channel,
            source: "sqlite",
          },
        },
      ];
    });
  } finally {
    database.close();
  }
}
