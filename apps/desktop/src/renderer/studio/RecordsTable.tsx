import type { Neighbor } from "@crate-dig/contracts";
import type { StudioTrack } from "@crate-dig/app-core";
import { MOOD_COLORS } from "./theme";
import { formatBpm, formatKey } from "./view";

export function RecordsTable(props: {
  tracks: readonly StudioTrack[];
  selectedId: string | null;
  neighbors: readonly Neighbor[];
  onSelect: (track: StudioTrack) => void;
}) {
  const scores = new Map(props.neighbors.map((neighbor) => [neighbor.trackId, neighbor.score]));
  const title = props.selectedId ? "Similar to selected" : "Records in view";

  return (
    <section className="records" aria-label="Candidate tracks">
      <div className="records-head">
        <h2>{title}</h2>
        <span className="muted">{props.tracks.length} tracks</span>
      </div>
      <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
        <table>
          <thead>
            <tr>
              <th />
              <th>Title</th>
              <th>Artist</th>
              <th>BPM</th>
              <th>Key</th>
              <th>Vibe</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {props.tracks.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No local tracks yet.
                </td>
              </tr>
            ) : (
              props.tracks.map((track) => {
                const score = scores.get(track.id);
                return (
                  <tr
                    key={track.id}
                    aria-selected={track.id === props.selectedId}
                    onClick={() => props.onSelect(track)}
                  >
                    <td>
                      <span className="swatch" style={{ background: MOOD_COLORS[track.mood] }} />
                    </td>
                    <td>{track.title}</td>
                    <td>{track.artist}</td>
                    <td>{formatBpm(track.bpm)}</td>
                    <td>{formatKey(track.key)}</td>
                    <td>
                      <span className="vibe">
                        {track.mood}
                        {track.textures[0] ? ` · ${track.textures[0]}` : ""}
                      </span>
                    </td>
                    <td>
                      <span className="match">
                        <span style={{ width: score != null ? `${Math.round(score * 100)}%` : "0%" }} />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
