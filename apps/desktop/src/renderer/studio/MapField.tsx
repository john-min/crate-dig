import type { StudioTrack } from "@crate-dig/app-core";
import { MOOD_COLORS } from "./theme";
import { formatBpm, formatDuration, formatKey } from "./view";

function project(track: StudioTrack): { x: number; y: number } {
  return { x: 50 + track.umap_x * 8.5, y: 48 - track.umap_y * 8.5 };
}

export function MapField(props: {
  tracks: readonly StudioTrack[];
  selected: StudioTrack | null;
  playingId: string | null;
  onSelect: (track: StudioTrack) => void;
}) {
  const labels = uniqueClusterLabels(props.tracks);

  return (
    <section className="map" aria-label="Library map">
      {props.tracks.length === 0 ? (
        <p className="map-empty">
          Import a local folder to place records here. Point positions are display layout until
          analysis neighbors exist — not sonic distance.
        </p>
      ) : (
        <svg className="map-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {labels.map((label) => (
            <text key={label.name} className="cluster-label" x={label.x} y={label.y}>
              {label.name}
            </text>
          ))}
          {props.tracks.map((track) => {
            const point = project(track);
            const selected = props.selected?.id === track.id;
            const playing = props.playingId === track.id;
            return (
              <circle
                key={track.id}
                className="dot"
                cx={point.x}
                cy={point.y}
                r={selected || playing ? 1.35 : 0.85}
                fill={MOOD_COLORS[track.mood]}
                opacity={selected ? 1 : 0.82}
                onClick={() => props.onSelect(track)}
              >
                <title>
                  {track.title} — {track.artist}
                </title>
              </circle>
            );
          })}
        </svg>
      )}
      {props.selected ? (
        <article
          className="selection-card"
          style={{
            left: `min(72%, ${project(props.selected).x}%)`,
            top: `min(58%, ${project(props.selected).y}%)`,
          }}
        >
          <h3>{props.selected.title}</h3>
          <p>{props.selected.artist}</p>
          <p>
            {formatBpm(props.selected.bpm)} BPM · {formatKey(props.selected.key)} ·{" "}
            {formatDuration(props.selected.durationSec)}
          </p>
          <p className="vibe">
            <span className="swatch" style={{ background: MOOD_COLORS[props.selected.mood] }} />
            {props.selected.mood}
            {props.selected.textures[0] ? ` · ${props.selected.textures[0]}` : ""}
          </p>
        </article>
      ) : null}
      <p className="map-hint">Distance = display layout, not sonic similarity until neighbors exist.</p>
    </section>
  );
}

function uniqueClusterLabels(tracks: readonly StudioTrack[]): { name: string; x: number; y: number }[] {
  const groups = new Map<string, StudioTrack[]>();
  for (const track of tracks) {
    if (!track.clusterName || track.clusterName === "Unanalyzed") continue;
    const current = groups.get(track.clusterName) ?? [];
    current.push(track);
    groups.set(track.clusterName, current);
  }
  return [...groups.entries()].map(([name, members]) => {
    const cx = members.reduce((sum, track) => sum + project(track).x, 0) / members.length;
    const cy = members.reduce((sum, track) => sum + project(track).y, 0) / members.length - 3;
    return { name, x: cx, y: cy };
  });
}
