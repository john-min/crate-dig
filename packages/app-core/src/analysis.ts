import type { Neighbor, Readiness, TrackAnalysis } from "@crate-dig/contracts";
import type { AnalysisStatus, PreviewState, SimilarityReason } from "./studio";

const TERMINAL_STAGE_STATUSES = new Set(["succeeded", "failed", "skipped"]);
const IN_PROGRESS_STAGE_STATUSES = new Set(["queued", "running"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return [];
}

function hasUsableEvidence(value: unknown): boolean {
  return asArray(value).length > 0;
}

function stageStatuses(stages: unknown): string[] {
  return asArray(stages).map((stage) => {
    if (!isRecord(stage)) return "";
    return typeof stage.status === "string" ? stage.status : "";
  });
}

/**
 * Map FastAPI track-analysis / analysis-run-track evidence onto the contract
 * readiness enum. Empty payloads stay imported; in-progress stays queued or
 * processing; failed stays failed; usable features or embeddings are ready.
 */
export function readinessFromAnalysisEvidence(input: {
  state?: string | null;
  stages?: unknown;
  features?: unknown;
  embeddings?: unknown;
  stagesTotal?: number | null;
  stagesDone?: number | null;
  stagesRunning?: number | null;
  stagesFailed?: number | null;
}): Readiness {
  const state = input.state?.trim();
  if (state === "failed") return "failed";
  if (state === "queued") return "queued";
  if (state === "running" || state === "processing_fast") return "processing_fast";
  if (state === "processing_deep") return "processing_deep";
  if (state === "ready_deep" || state === "completed_deep") return "ready_deep";
  if (state === "ready_fast" || state === "completed" || state === "succeeded") {
    return "ready_fast";
  }

  if (
    input.stagesTotal != null ||
    input.stagesDone != null ||
    input.stagesRunning != null ||
    input.stagesFailed != null
  ) {
    const total = input.stagesTotal ?? 0;
    const done = input.stagesDone ?? 0;
    const running = input.stagesRunning ?? 0;
    const failed = input.stagesFailed ?? 0;
    if (running > 0) return "processing_fast";
    if (total === 0) return "imported";
    if (done < total) return "queued";
    if (failed >= total) return "failed";
    if (failed > 0) return "degraded";
    return "ready_fast";
  }

  const statuses = stageStatuses(input.stages);
  const usable =
    hasUsableEvidence(input.features) || hasUsableEvidence(input.embeddings);
  const inProgress = statuses.some((status) => IN_PROGRESS_STAGE_STATUSES.has(status));
  const allTerminal =
    statuses.length > 0 && statuses.every((status) => TERMINAL_STAGE_STATUSES.has(status));
  const failedCount = statuses.filter((status) => status === "failed").length;
  const succeededCount = statuses.filter((status) => status === "succeeded").length;

  if (inProgress) {
    return statuses.some((status) => status === "running") ? "processing_fast" : "queued";
  }
  if (usable) return failedCount > 0 ? "degraded" : "ready_fast";
  if (allTerminal && failedCount > 0 && succeededCount === 0) return "failed";
  if (statuses.length === 0 && !usable) return "imported";
  return "queued";
}

export function readinessFromTrackAnalysis(analysis: TrackAnalysis | null | undefined): Readiness {
  if (!analysis) return "imported";
  if (analysis.readiness) return analysis.readiness;
  return readinessFromAnalysisEvidence({
    state: analysis.state,
    stages: analysis.stages,
    features: analysis.features,
    embeddings: analysis.embeddings,
  });
}

export function analysisStatusFromReadiness(
  readiness: Readiness | undefined,
  missingMetadata: boolean,
): AnalysisStatus {
  if (readiness === "failed") return "failed";
  if (readiness === "ready_fast" || readiness === "ready_deep" || readiness === "degraded") {
    return "ok";
  }
  if (missingMetadata) return "missing-metadata";
  return "pending";
}

export function previewStateFromUrl(previewUrl: string | null | undefined): PreviewState {
  return previewUrl ? "ready" : "missing";
}

export function neighborIsNonSonic(neighbor: Neighbor): boolean {
  return (
    neighbor.component === "prototype-map-distance" ||
    (isRecord(neighbor.evidence) && neighbor.evidence.nonSonic === true)
  );
}

function humanizeReasonCode(code: string): string {
  return code.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function reasonCodesFrom(neighbor: Neighbor): string[] {
  if (!isRecord(neighbor.evidence)) return [];
  const raw = neighbor.evidence.reasonCodes ?? neighbor.evidence.reason_codes;
  return asArray(raw).filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

/**
 * Similarity reasons come from adapter neighbor evidence only.
 * Missing neighbors yield an empty list — never invented texture, mood, or scores.
 */
export function displaySimilarityReasons(neighbor?: Neighbor | null): SimilarityReason[] {
  if (!neighbor) return [];
  const reasons: SimilarityReason[] = [];
  if (neighborIsNonSonic(neighbor)) {
    reasons.push({
      label: "Prototype map distance — not sonic analysis",
      kind: "warning",
    });
  }
  for (const code of reasonCodesFrom(neighbor)) {
    reasons.push({ label: humanizeReasonCode(code), kind: "shared" });
  }
  if (typeof neighbor.score === "number" && Number.isFinite(neighbor.score)) {
    reasons.push({
      label: `${neighbor.score.toFixed(2)} neighbor score`,
      kind: neighbor.score < 0.72 ? "warning" : "distance",
    });
  }
  return reasons.slice(0, 5);
}

export function neighborReasonCopy(neighbor: Neighbor): string {
  const reasons = displaySimilarityReasons(neighbor);
  return reasons.map((reason) => reason.label).join(" · ");
}
