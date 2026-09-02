import type { Neighbor } from "@crate-dig/contracts";
import { displaySimilarityReasons } from "@crate-dig/app-core";
import { qDockBody, qDockHeadline, type QDockState } from "./view";

export function QDock(props: {
  state: QDockState;
  neighbors: readonly Neighbor[];
  prompt: string;
  onPrompt: (value: string) => void;
  onAsk: () => void;
  promptMessage?: string;
}) {
  return (
    <aside className="q-dock" aria-label="Q assistant">
      <div className="q-head">
        <span className="q-badge">Q</span>
        <strong>Q</strong>
      </div>
      <div className="q-body" role="status">
        <div className="q-status">
          {props.state.kind === "listening" ? <span className="pulse" /> : null}
          <div>
            <strong>{qDockHeadline(props.state)}</strong>
            <p className="q-note">{qDockBody(props.state)}</p>
          </div>
        </div>
        {props.neighbors.map((neighbor) => (
          <article key={neighbor.trackId} className="q-card">
            <strong>{neighbor.trackId}</strong>
            <small>
              {neighbor.score.toFixed(2)}
              {displaySimilarityReasons(neighbor)
                .map((reason) => ` · ${reason.label}`)
                .join("")}
            </small>
          </article>
        ))}
        {props.promptMessage ? <p className="q-note">{props.promptMessage}</p> : null}
      </div>
      <form
        className="q-ask"
        onSubmit={(event) => {
          event.preventDefault();
          props.onAsk();
        }}
      >
        <label>
          <span className="sr-only">Ask Q</span>
          <input
            value={props.prompt}
            onChange={(event) => props.onPrompt(event.target.value)}
            placeholder="Ask Q…"
          />
        </label>
      </form>
    </aside>
  );
}
