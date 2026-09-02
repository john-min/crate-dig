export function TopBar(props: {
  query: string;
  onQuery: (query: string) => void;
  lasso: boolean;
  onLasso: () => void;
  sidecarLabel: string;
  sidecarOk: boolean;
  onAskQ: () => void;
}) {
  return (
    <header className="topbar">
      <div className="wordmark">
        <span className="mark" aria-hidden>
          <span />
        </span>
        <strong>Crate Dig</strong>
      </div>
      <label className="search">
        <span aria-hidden>⌕</span>
        <span className="sr-only">Search tracks, artists, labels</span>
        <input
          type="search"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          placeholder="Search tracks, artists, labels, or describe a vibe…"
        />
        <span className="kbd">⌘K</span>
      </label>
      <button type="button" className="ghost" disabled title="Colour by mood">
        Colour by: mood
      </button>
      <button
        type="button"
        className="ghost"
        aria-pressed={props.lasso}
        title="Lasso selection is a later gate"
        onClick={props.onLasso}
      >
        Lasso
      </button>
      <button type="button" className="ask-q" onClick={props.onAskQ}>
        <span className="q-badge">Q</span>
        <span className="ask-q-label">Ask Q to find, explain, or shape a crate…</span>
      </button>
      <div className="topbar-end">
        <span className={props.sidecarOk ? "sidecar-chip ok" : "sidecar-chip warn"}>{props.sidecarLabel}</span>
      </div>
    </header>
  );
}
