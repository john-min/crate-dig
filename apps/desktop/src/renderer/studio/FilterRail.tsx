import type { Energy, Mood, StudioFilters, Texture } from "@crate-dig/app-core";
import { ENERGIES, MOODS, TEXTURES } from "./theme";
import type { LibraryView } from "./view";

export function FilterRail(props: {
  trackCount: number;
  recentCount: number;
  unplayedCount: number;
  view: LibraryView;
  onView: (view: LibraryView) => void;
  filters: StudioFilters;
  onFilters: (filters: StudioFilters) => void;
  bpmLo: number;
  bpmHi: number;
  localOnly: boolean;
  cloudEnabled: boolean;
  cloudMessage?: string;
  busy: boolean;
  onImport: () => void;
  onRestartSidecar: () => void;
  onToggleCloud: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const { filters } = props;

  function toggleMood(mood: Mood) {
    props.onFilters({
      ...filters,
      moods: filters.moods.includes(mood)
        ? filters.moods.filter((item) => item !== mood)
        : [...filters.moods, mood],
    });
  }

  function toggleEnergy(energy: Energy) {
    props.onFilters({
      ...filters,
      energies: filters.energies.includes(energy)
        ? filters.energies.filter((item) => item !== energy)
        : [...filters.energies, energy],
    });
  }

  function toggleTexture(texture: Texture) {
    props.onFilters({
      ...filters,
      textures: filters.textures.includes(texture)
        ? filters.textures.filter((item) => item !== texture)
        : [...filters.textures, texture],
    });
  }

  return (
    <aside className="rail" aria-label="Library filters">
      <nav aria-label="Library">
        <NavRow
          label="All records"
          count={props.trackCount}
          current={props.view === "all"}
          onClick={() => props.onView("all")}
        />
        <NavRow label="Map" count={props.trackCount} current onClick={() => props.onView("all")} />
        <NavRow
          label="Recently added"
          count={props.recentCount}
          current={props.view === "recent"}
          onClick={() => props.onView("recent")}
        />
        <NavRow
          label="Unplayed"
          count={props.unplayedCount}
          current={props.view === "unplayed"}
          onClick={() => props.onView("unplayed")}
        />
        <button type="button" className="nav-row" disabled>
          Analysis runs
          <span>0</span>
        </button>
      </nav>

      <div className="section-label">Energy</div>
      <div className="chips">
        {ENERGIES.map((energy) => (
          <button
            key={energy}
            type="button"
            className="chip"
            aria-pressed={filters.energies.includes(energy)}
            onClick={() => toggleEnergy(energy)}
          >
            {energy}
          </button>
        ))}
      </div>

      <div className="section-label">Mood</div>
      <div className="chips">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            className="chip"
            aria-pressed={filters.moods.includes(mood)}
            onClick={() => toggleMood(mood)}
          >
            {mood}
          </button>
        ))}
      </div>

      <div className="section-label">Texture</div>
      <div className="chips">
        {TEXTURES.map((texture) => (
          <button
            key={texture}
            type="button"
            className="chip"
            aria-pressed={filters.textures.includes(texture)}
            onClick={() => toggleTexture(texture)}
          >
            {texture}
          </button>
        ))}
      </div>

      <div className="section-label">
        BPM
        <span>
          {Math.round(filters.bpmMin)}–{Math.round(filters.bpmMax)}
        </span>
      </div>
      <div className="bpm">
        <label>
          <span className="sr-only">Minimum BPM</span>
          <input
            type="range"
            min={props.bpmLo}
            max={props.bpmHi}
            value={filters.bpmMin}
            onChange={(event) =>
              props.onFilters({
                ...filters,
                bpmMin: Math.min(Number(event.target.value), filters.bpmMax),
              })
            }
          />
        </label>
        <label>
          <span className="sr-only">Maximum BPM</span>
          <input
            type="range"
            min={props.bpmLo}
            max={props.bpmHi}
            value={filters.bpmMax}
            onChange={(event) =>
              props.onFilters({
                ...filters,
                bpmMax: Math.max(Number(event.target.value), filters.bpmMin),
              })
            }
          />
        </label>
      </div>

      <div className="section-label">Crates</div>
      <p className="muted" style={{ padding: "0 10px", margin: 0 }}>
        No crates yet. Desktop does not invent crate names.
      </p>

      <div className="rail-foot">
        <div>{props.localOnly ? "Local-only mode · files stay on disk" : props.cloudMessage}</div>
        <div className="rail-actions">
          <button type="button" className="primary" onClick={props.onImport} disabled={props.busy}>
            Choose folder
          </button>
          <button type="button" className="secondary" onClick={props.onRestartSidecar}>
            Restart sidecar
          </button>
        </div>
        <div className="rail-actions">
          <button type="button" className="secondary" onClick={props.onToggleCloud}>
            {props.cloudEnabled ? "Disable cloud sync" : "Enable cloud sync"}
          </button>
          <button type="button" className="secondary" disabled={!props.cloudEnabled} onClick={props.onSignIn}>
            Sign in
          </button>
          <button type="button" className="secondary" onClick={props.onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavRow(props: { label: string; count: number; current: boolean; onClick: () => void }) {
  return (
    <button type="button" className="nav-row" aria-current={props.current} onClick={props.onClick}>
      {props.label}
      <span>{props.count.toLocaleString()}</span>
    </button>
  );
}
