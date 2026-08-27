import type {
  EvaluationAnchor,
  EvaluationDimension,
  JudgmentValue,
  RankedCandidate,
  RetrievalConfiguration,
} from "@/lib/similarity-lab/similarity-lab-api";
import type { KeyboardEvent } from "react";
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, SkipIcon } from "./LabIcons";

function displayDuration(seconds: number | null): string {
  if (!seconds) return "—:—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function score(value: number): string {
  return value.toFixed(2);
}

function CandidateCard({
  candidate,
  configuration,
  blind,
  playingId,
  savingId,
  dimension,
  onPlay,
  onJudge,
}: {
  candidate: RankedCandidate;
  configuration: RetrievalConfiguration;
  blind: boolean;
  playingId: string | null;
  savingId: string | null;
  dimension: EvaluationDimension;
  onPlay: (candidate: RankedCandidate) => void;
  onJudge: (candidate: RankedCandidate, value: JudgmentValue) => void;
}) {
  const playing = playingId === candidate.id;
  const saving = savingId === `${configuration.id}:${candidate.id}`;
  const label = blind ? `Candidate ${String(candidate.rank).padStart(2, "0")}` : candidate.track.title;

  function handleShortcut(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || saving) return;
    const key = event.key.toLowerCase();
    if (key === "j") onJudge(candidate, "similar");
    else if (key === "k") onJudge(candidate, "not_similar");
    else if (key === "s") onJudge(candidate, "skip");
    else return;
    event.preventDefault();
  }

  return (
    <article
      tabIndex={0}
      onKeyDown={handleShortcut}
      aria-label={`${label}, rank ${candidate.rank}, score ${score(candidate.score)}. Press J for fits, K for doesn't fit, or S to skip.`}
      className={`group border-b border-[var(--hairline)] px-3 py-3 transition-colors last:border-b-0 ${candidate.judgment ? "bg-[color-mix(in_srgb,var(--control)_68%,transparent)]" : "hover:bg-[var(--raised)]"}`}
    >
      <div className="grid grid-cols-[30px_minmax(0,1fr)_44px] items-start gap-2">
        <button
          type="button"
          onClick={() => onPlay(candidate)}
          disabled={!candidate.track.previewUrl}
          aria-label={candidate.track.previewUrl ? `${playing ? "Pause" : "Play"} ${label}` : `Preview unavailable for ${label}`}
          className="mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-[var(--border)] text-[var(--ink-2)] transition-colors hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:opacity-30"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="truncate text-[12.5px] font-semibold text-paper">{label}</h4>
            <span className="tabular shrink-0 text-[11.5px] font-semibold text-amber">{score(candidate.score)}</span>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-tertiary)]">
            {blind ? `Rank ${candidate.rank} · ${displayDuration(candidate.track.durationSec)}` : `${candidate.track.artist} · ${displayDuration(candidate.track.durationSec)}`}
          </p>
        </div>
        <span className="mt-1 h-[3px] overflow-hidden rounded-full bg-[var(--hairline)]" aria-label={`Similarity ${Math.round(candidate.score * 100)} percent`}>
          <span className="block h-full bg-amber" style={{ width: `${Math.max(0, Math.min(100, candidate.score * 100))}%` }} />
        </span>
      </div>

      <div className="ml-10 mt-2.5 flex flex-wrap gap-1.5">
        {candidate.reasonCodes.slice(0, 2).map((reason) => (
          <span key={reason} className="rounded-full bg-[var(--control)] px-2 py-1 text-[11px] text-[var(--ink-2)]">{reason}</span>
        ))}
      </div>

      <dl className="ml-10 mt-3 grid grid-cols-3 gap-2">
        {candidate.channelScores.slice(0, 3).map((channel) => (
          <div key={channel.channel} className="min-w-0">
            <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">{channel.label}</dt>
            <dd className="mt-1 flex items-center gap-1.5">
              <span className="h-[2px] flex-1 overflow-hidden bg-[var(--hairline)]"><span className="block h-full bg-violet" style={{ width: `${channel.score * 100}%` }} /></span>
              <span className="tabular text-[11px] text-[var(--ink-tertiary)]">{score(channel.score)}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="ml-10 mt-3 flex items-center gap-1.5" aria-label={`Judge ${label} for ${dimension.replace("_", " ")}`}>
        <button type="button" disabled={saving} onClick={() => onJudge(candidate, "similar")} aria-pressed={candidate.judgment === "similar"} className={`inline-flex h-7 items-center gap-1 rounded-[7px] border px-2 text-[11px] font-medium transition-colors ${candidate.judgment === "similar" ? "border-lime/50 bg-lime/10 text-lime" : "border-[var(--border)] text-[var(--ink-2)] hover:border-lime/50 hover:text-lime"}`}><CheckIcon className="h-3 w-3" /> Fits</button>
        <button type="button" disabled={saving} onClick={() => onJudge(candidate, "not_similar")} aria-pressed={candidate.judgment === "not_similar"} className={`inline-flex h-7 items-center gap-1 rounded-[7px] border px-2 text-[11px] font-medium transition-colors ${candidate.judgment === "not_similar" ? "border-coral/50 bg-coral/10 text-coral" : "border-[var(--border)] text-[var(--ink-2)] hover:border-coral/50 hover:text-coral"}`}><CloseIcon className="h-3 w-3" /> Doesn&apos;t</button>
        <button type="button" disabled={saving} onClick={() => onJudge(candidate, "skip")} aria-pressed={candidate.judgment === "skip"} className={`ml-auto grid h-7 w-7 place-items-center rounded-[7px] border transition-colors ${candidate.judgment === "skip" ? "border-violet/50 bg-violet/10 text-violet" : "border-[var(--border)] text-[var(--ink-tertiary)] hover:text-paper"}`} aria-label="Skip judgment"><SkipIcon className="h-3 w-3" /></button>
      </div>
    </article>
  );
}

export function ComparisonBoard({
  anchor,
  configurations,
  rankings,
  blind,
  playingId,
  savingId,
  dimension,
  onPlay,
  onJudge,
}: {
  anchor: EvaluationAnchor;
  configurations: RetrievalConfiguration[];
  rankings: Record<string, RankedCandidate[]>;
  blind: boolean;
  playingId: string | null;
  savingId: string | null;
  dimension: EvaluationDimension;
  onPlay: (candidate: RankedCandidate) => void;
  onJudge: (configurationId: string, candidate: RankedCandidate, value: JudgmentValue) => void;
}) {
  if (!configurations.length) {
    return <div className="grid min-h-80 place-items-center border-y border-[var(--hairline)] text-[12px] text-[var(--ink-tertiary)]">Select at least one retrieval configuration.</div>;
  }

  return (
    <section className="min-w-0" aria-label={`Rankings for ${anchor.label}`}>
      <div className="grid min-w-[760px] divide-x divide-[var(--hairline)] border-y border-[var(--hairline)]" style={{ gridTemplateColumns: `repeat(${configurations.length}, minmax(270px, 1fr))` }}>
        {configurations.map((configuration) => (
          <div key={configuration.id} className="min-w-0 bg-[var(--panel)]">
            <div className="sticky top-0 z-10 min-h-[76px] border-b border-[var(--hairline)] bg-[color-mix(in_srgb,var(--panel)_96%,transparent)] px-3 py-3 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[12.5px] font-semibold text-paper">{configuration.name}</h3>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">{configuration.role} · {configuration.version}</p>
                </div>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${configuration.status === "ready" ? "bg-lime" : configuration.status === "running" ? "bg-amber" : "bg-coral"}`} aria-label={configuration.status} />
              </div>
              <p className="mt-2 truncate text-[11px] text-[var(--ink-faint)]">{configuration.channels.join(" · ")}</p>
            </div>
            <div>
              {(rankings[configuration.id] || []).length ? (
                (rankings[configuration.id] || []).map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} configuration={configuration} blind={blind} playingId={playingId} savingId={savingId} dimension={dimension} onPlay={onPlay} onJudge={(item, value) => onJudge(configuration.id, item, value)} />
                ))
              ) : (
                <div className="px-4 py-12 text-center">
                  <p className="text-[12px] font-medium text-paper">No neighbors returned</p>
                  <p className="mt-1 text-[11.5px] text-[var(--ink-tertiary)]">Analyze this anchor with {configuration.name}, then refresh the round.</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
