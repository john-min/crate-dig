import type { StudioTrack } from "@crate-dig/app-core";
import { formatBpm, formatClock, formatKey } from "./view";

export function PlayerBar(props: {
  track: StudioTrack | null;
  playing: boolean;
  currentTime: number;
  status?: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
}) {
  const duration = props.track?.durationSec ?? 0;
  return (
    <footer className="player">
      <div className="now-playing">
        <div className="disc" aria-hidden>
          <i />
        </div>
        <div>
          <p>{props.track?.title ?? "No track loaded"}</p>
          <p className="meta">
            {props.track
              ? `${props.track.artist} · ${formatBpm(props.track.bpm)} · ${formatKey(props.track.key)}`
              : "Audition from the map or list"}
          </p>
        </div>
      </div>
      <div className="transport">
        <button
          type="button"
          className="play"
          aria-label={props.playing ? "Pause" : "Play"}
          disabled={!props.track}
          onClick={props.onToggle}
        >
          {props.playing ? "❚❚" : "▶"}
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(props.currentTime, duration || 0)}
          disabled={!props.track || duration <= 0}
          onChange={(event) => props.onSeek(Number(event.target.value))}
        />
        <span className="clock">
          {formatClock(props.currentTime)} / {formatClock(duration)}
        </span>
      </div>
      <div className="status">{props.status}</div>
    </footer>
  );
}
