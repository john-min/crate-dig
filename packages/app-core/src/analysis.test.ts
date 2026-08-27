import { describe, expect, it } from "vitest";
import type { Neighbor } from "@crate-dig/contracts";
import {
  analysisStatusFromReadiness,
  displaySimilarityReasons,
  neighborIsNonSonic,
  previewStateFromUrl,
  readinessFromAnalysisEvidence,
} from "./analysis";

describe("readinessFromAnalysisEvidence", () => {
  it("treats empty analysis as imported, not ready", () => {
    expect(readinessFromAnalysisEvidence({ stages: [], features: [], embeddings: [] })).toBe(
      "imported",
    );
  });

  it("keeps queued and running stages pending", () => {
    expect(
      readinessFromAnalysisEvidence({ stages: [{ status: "queued" }, { status: "succeeded" }] }),
    ).toBe("queued");
    expect(readinessFromAnalysisEvidence({ stages: [{ status: "running" }] })).toBe(
      "processing_fast",
    );
  });

  it("marks completed runs with features or embeddings ready", () => {
    expect(
      readinessFromAnalysisEvidence({
        stages: [{ status: "succeeded" }],
        features: [{ feature_key: "tempo.bpm:track" }],
      }),
    ).toBe("ready_fast");
    expect(
      readinessFromAnalysisEvidence({
        stages: [{ status: "succeeded" }],
        embeddings: [{ embedding_key: "retrieval:track" }],
      }),
    ).toBe("ready_fast");
  });

  it("marks terminal failures without usable evidence failed", () => {
    expect(
      readinessFromAnalysisEvidence({
        stages: [{ status: "failed" }],
        features: [],
        embeddings: [],
      }),
    ).toBe("failed");
  });

  it("maps analysis-run track progress counts without inventing features", () => {
    expect(
      readinessFromAnalysisEvidence({
        stagesTotal: 2,
        stagesDone: 1,
        stagesRunning: 1,
        stagesFailed: 0,
      }),
    ).toBe("processing_fast");
    expect(
      readinessFromAnalysisEvidence({
        stagesTotal: 1,
        stagesDone: 1,
        stagesRunning: 0,
        stagesFailed: 1,
      }),
    ).toBe("failed");
    expect(
      readinessFromAnalysisEvidence({
        stagesTotal: 2,
        stagesDone: 2,
        stagesRunning: 0,
        stagesFailed: 0,
      }),
    ).toBe("ready_fast");
  });
});

describe("analysisStatusFromReadiness", () => {
  it("maps completed evidence to ok and catalog gaps to missing-metadata", () => {
    expect(analysisStatusFromReadiness("ready_fast", true)).toBe("ok");
    expect(analysisStatusFromReadiness("degraded", false)).toBe("ok");
    expect(analysisStatusFromReadiness("imported", true)).toBe("missing-metadata");
    expect(analysisStatusFromReadiness("queued", false)).toBe("pending");
    expect(analysisStatusFromReadiness("failed", true)).toBe("failed");
  });
});

describe("previewStateFromUrl", () => {
  it("is missing when no playable URL exists", () => {
    expect(previewStateFromUrl(null)).toBe("missing");
    expect(previewStateFromUrl(undefined)).toBe("missing");
    expect(previewStateFromUrl("/audio/trk-1")).toBe("ready");
  });
});

describe("displaySimilarityReasons", () => {
  it("does not invent texture, mood, or fallback scores without neighbor evidence", () => {
    expect(displaySimilarityReasons(undefined)).toEqual([]);
    expect(displaySimilarityReasons(null)).toEqual([]);
  });

  it("uses adapter reason codes and labels prototype neighbors as non-sonic", () => {
    const sonic: Neighbor = {
      trackId: "near",
      score: 0.91,
      component: "librosa-zscore-v1",
      evidence: { reasonCodes: ["similar_global_style"] },
    };
    expect(displaySimilarityReasons(sonic).map((item) => item.label)).toEqual([
      "similar global style",
      "0.91 neighbor score",
    ]);
    const prototype: Neighbor = {
      trackId: "near",
      score: 0.4,
      component: "prototype-map-distance",
      evidence: { nonSonic: true },
    };
    expect(neighborIsNonSonic(prototype)).toBe(true);
    expect(displaySimilarityReasons(prototype).map((item) => item.label)).toContain(
      "Prototype map distance — not sonic analysis",
    );
    expect(displaySimilarityReasons(prototype).some((item) => /texture|mood/i.test(item.label))).toBe(
      false,
    );
  });
});
