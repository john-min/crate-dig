import { LOCAL_ANALYSIS_NEIGHBOR_CHANNEL, type Neighbor } from "@crate-dig/contracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSqliteNeighbors, sqliteNeighborsAvailable } from "./sqlite-store";
import { listSupabaseNeighbors } from "./supabase-store";

export type NeighborSource = "sqlite" | "supabase";

export async function listSonicNeighbors(
  trackId: string,
  options: {
    limit?: number;
    channel?: string;
    prefer?: NeighborSource;
  } = {},
): Promise<{ neighbors: Neighbor[]; source: NeighborSource }> {
  const channel = options.channel ?? LOCAL_ANALYSIS_NEIGHBOR_CHANNEL;
  const prefer = options.prefer ?? "sqlite";
  if (prefer === "sqlite" && sqliteNeighborsAvailable()) {
    return {
      neighbors: listSqliteNeighbors(trackId, { limit: options.limit, channel }),
      source: "sqlite",
    };
  }
  const neighbors = await listSupabaseNeighbors(createAdminClient(), trackId, {
    limit: options.limit,
    channel,
    demoOnly: prefer === "sqlite",
  });
  return { neighbors, source: "supabase" };
}
