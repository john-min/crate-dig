import type { EvaluationAnchor, EvaluationSetSummary } from "@/lib/similarity-lab/similarity-lab-api";

export function AnchorRail({
  evaluationSet,
  evaluationSets,
  anchors,
  activeAnchorId,
  loading,
  onSelect,
  onSelectSet,
}: {
  evaluationSet: EvaluationSetSummary;
  evaluationSets: EvaluationSetSummary[];
  anchors: EvaluationAnchor[];
  activeAnchorId: string;
  loading: boolean;
  onSelect: (anchor: EvaluationAnchor) => void;
  onSelectSet: (evaluationSetId: string) => void;
}) {
  const complete = anchors.filter((anchor) => anchor.judgmentCount >= anchor.targetJudgments).length;
  const progress = anchors.length ? (complete / anchors.length) * 100 : 0;

  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--hairline)] bg-[var(--panel)]" aria-label="Evaluation anchors">
      <div className="border-b border-[var(--hairline)] px-4 pb-4 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-tertiary)]">Evaluation set</p>
        <label className="sr-only" htmlFor="evaluation-set">Evaluation set</label>
        <select
          id="evaluation-set"
          value={evaluationSet.id}
          disabled={loading || evaluationSets.length < 2}
          onChange={(event) => onSelectSet(event.target.value)}
          className="mt-2 h-8 w-full rounded-[7px] border border-[var(--border)] bg-[var(--app-base)] px-2 text-[12px] font-semibold text-paper disabled:cursor-default disabled:border-transparent disabled:px-0"
        >
          {evaluationSets.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-tertiary)]">{evaluationSet.description}</p>
        <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--ink-2)]">
          <span>{complete} of {anchors.length} anchors complete</span>
          <span className="tabular">v{evaluationSet.version}</span>
        </div>
        <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-[var(--hairline)]" aria-hidden>
          <span className="block h-full bg-amber transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Anchors">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">Anchors</p>
        <ul className="space-y-0.5">
          {anchors.map((anchor, index) => {
            const active = anchor.id === activeAnchorId;
            const done = anchor.judgmentCount >= anchor.targetJudgments;
            return (
              <li key={anchor.id}>
                <button
                  type="button"
                  onClick={() => onSelect(anchor)}
                  aria-current={active ? "true" : undefined}
                  className={`group grid min-h-12 w-full grid-cols-[24px_1fr_auto] items-center gap-2 rounded-[8px] px-2 text-left transition-colors ${active ? "bg-[var(--control)] text-paper" : "text-[var(--ink-2)] hover:bg-[var(--raised)] hover:text-paper"}`}
                >
                  <span className={`tabular text-[11px] ${active ? "text-amber" : "text-[var(--ink-faint)]"}`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{anchor.label}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-tertiary)]">{anchor.heldOut ? "Held out" : `${anchor.judgmentCount}/${anchor.targetJudgments} judged`}</span>
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-lime" : anchor.judgmentCount ? "bg-amber" : "bg-[var(--ink-faint)]"}`} aria-label={done ? "Complete" : "Incomplete"} />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--hairline)] px-4 py-3 text-[11px] leading-[1.5] text-[var(--ink-tertiary)]">
        Primary judgments stay blind. Reveal metadata only after you commit a rating.
      </div>
    </aside>
  );
}
