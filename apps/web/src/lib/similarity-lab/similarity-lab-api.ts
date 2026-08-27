import { LOCAL_API_URL } from "@/lib/studio/local-api";

export type JudgmentValue = "similar" | "not_similar" | "skip";
export type EvaluationDimension =
  | "overall"
  | "drums"
  | "bass"
  | "melodic_palette"
  | "groove"
  | "production_space"
  | "mix_compatibility";

export type LabTrack = {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  previewUrl: string | null;
};

export type EvaluationSetSummary = {
  id: string;
  name: string;
  version: string;
  description: string;
  anchorCount: number;
  completedAnchors: number;
  hiddenMetadata: boolean;
};

export type EvaluationAnchor = {
  id: string;
  label: string;
  track: LabTrack;
  judgmentCount: number;
  targetJudgments: number;
  heldOut: boolean;
};

export type RetrievalConfiguration = {
  id: string;
  name: string;
  version: string;
  role: string;
  description: string;
  channels: string[];
  status: "ready" | "running" | "failed";
};

export type ChannelScore = {
  channel: string;
  label: string;
  score: number;
};

export type RankedCandidate = {
  id: string;
  track: LabTrack;
  rank: number;
  score: number;
  confidence: number | null;
  reasonCodes: string[];
  channelScores: ChannelScore[];
  judgment: JudgmentValue | null;
};

export type ConfigurationRanking = {
  configurationId: string;
  candidates: RankedCandidate[];
};

export type ConfigurationMetrics = {
  configurationId: string;
  acceptedAt10: number | null;
  ndcgAt10: number | null;
  tripletAccuracy: number | null;
  runtimePerAudioMinute: number | null;
  failureRate: number | null;
  bytesPerTrack: number | null;
  judgmentCount: number;
};

export type SimilarityLabSnapshot = {
  source: "api" | "sample";
  sourceMessage: string;
  evaluationSets: EvaluationSetSummary[];
  activeSet: EvaluationSetSummary;
  anchors: EvaluationAnchor[];
  configurations: RetrievalConfiguration[];
  rankings: ConfigurationRanking[];
  metrics: ConfigurationMetrics[];
};

export type SaveJudgmentInput = {
  anchorTrackId: string;
  candidateTrackId: string;
  configurationId: string;
  dimension: EvaluationDimension;
  judgment: JudgmentValue;
  rank: number;
  blind: boolean;
  notes?: string;
};

type JsonRecord = Record<string, unknown>;

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${LOCAL_API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Local evaluation API returned ${response.status}`);
  }
  return response.json();
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTrack(value: unknown): LabTrack {
  const row = asRecord(value);
  const previewPath = asString(row.preview_url || row.previewUrl);
  return {
    id: asString(row.track_id || row.id),
    title: asString(row.title, "Untitled record"),
    artist: asString(row.artist, "Unknown artist"),
    durationSec: nullableNumber(row.duration_sec || row.durationSec),
    previewUrl: previewPath
      ? previewPath.startsWith("http")
        ? previewPath
        : `${LOCAL_API_URL}${previewPath}`
      : null,
  };
}

function normalizeSet(value: unknown): EvaluationSetSummary {
  const row = asRecord(value);
  const hiddenMetadataPolicy = asRecord(row.hidden_metadata_policy);
  return {
    id: asString(row.id),
    name: asString(row.name, "Untitled evaluation set"),
    version: asString(row.version, "1"),
    description: asString(row.description),
    anchorCount: asNumber(row.anchor_count || row.anchorCount),
    completedAnchors: asNumber(row.completed_anchors || row.completedAnchors),
    hiddenMetadata:
      row.hidden_metadata !== false &&
      row.hiddenMetadata !== false &&
      hiddenMetadataPolicy.hide_during_primary_judgment !== false,
  };
}

function normalizeAnchor(value: unknown): EvaluationAnchor {
  const row = asRecord(value);
  return {
    id: asString(row.id || row.anchor_id),
    label: asString(row.label, "Anchor"),
    track: normalizeTrack(row.track || row),
    judgmentCount: asNumber(row.judgment_count || row.judgmentCount),
    targetJudgments: asNumber(row.target_judgments || row.targetJudgments, 8),
    heldOut: row.held_out === true || row.heldOut === true,
  };
}

function normalizeConfiguration(value: unknown): RetrievalConfiguration {
  const row = asRecord(value);
  const status = asString(row.status, "ready");
  const channel = asString(row.channel);
  return {
    id: asString(row.id || row.configuration_id),
    name: asString(row.name, "Unnamed configuration"),
    version: asString(row.version, "1"),
    role: asString(row.role, channel || "retrieval"),
    description: asString(row.description),
    channels: [
      ...asArray(row.channels).map((item) => asString(item)),
      channel,
    ].filter(Boolean),
    status: status === "running" || status === "failed" ? status : "ready",
  };
}

function normalizeCandidate(value: unknown): RankedCandidate {
  const row = asRecord(value);
  let channels = asArray(row.channel_scores || row.channelScores).map((value) => {
    const channel = asRecord(value);
    return {
      channel: asString(channel.channel || channel.id),
      label: asString(channel.label || channel.channel),
      score: asNumber(channel.score),
    };
  });
  if (!channels.length) {
    channels = Object.entries(asRecord(row.components)).map(([channel, value]) => ({
      channel,
      label: channel.replaceAll("_", " "),
      score: asNumber(value),
    }));
  }
  const judgment = asString(row.judgment);
  return {
    id: asString(row.id || row.target_track_id),
    track: normalizeTrack(row.track || row),
    rank: asNumber(row.rank),
    score: asNumber(row.score),
    confidence: nullableNumber(row.confidence),
    reasonCodes: asArray(row.reason_codes || row.reasonCodes)
      .map((item) => asString(item))
      .filter(Boolean),
    channelScores: channels,
    judgment:
      judgment === "similar" || judgment === "not_similar" || judgment === "skip"
        ? judgment
        : null,
  };
}

function normalizeRanking(value: unknown): ConfigurationRanking {
  const row = asRecord(value);
  return {
    configurationId: asString(row.configuration_id || row.configurationId || row.id),
    candidates: asArray(row.candidates || row.neighbors).map(normalizeCandidate),
  };
}

function normalizeMetric(value: unknown): ConfigurationMetrics {
  const row = asRecord(value);
  const nestedMetrics = asArray(row.metrics).map(asRecord);
  const metric = (name: string, k?: number): JsonRecord | undefined =>
    nestedMetrics.find(
      (item) =>
        item.metric_name === name &&
        (item.dimension === "overall" || item.dimension == null) &&
        (k === undefined || asNumber(item.k) === k),
    );
  const accepted = metric("accepted_at_k");
  const ndcg = metric("ndcg", 10);
  const triplet = metric("triplet_accuracy");
  const runtimeMetric = metric("runtime_per_audio_minute");
  const failureMetric = metric("failure_rate");
  const bytesMetric = metric("artifact_bytes_per_track");
  return {
    configurationId: asString(row.configuration_id || row.configurationId || row.id),
    acceptedAt10:
      nullableNumber(accepted?.value) ??
      nullableNumber(row.accepted_at_10 || row.acceptedAt10 || row.precision_at_10),
    ndcgAt10: nullableNumber(ndcg?.value) ?? nullableNumber(row.ndcg_at_10 || row.ndcgAt10),
    tripletAccuracy:
      nullableNumber(triplet?.value) ??
      nullableNumber(row.triplet_accuracy || row.tripletAccuracy),
    runtimePerAudioMinute: nullableNumber(
      runtimeMetric?.value || row.runtime_per_audio_minute || row.runtimePerAudioMinute,
    ),
    failureRate: nullableNumber(failureMetric?.value || row.failure_rate || row.failureRate),
    bytesPerTrack: nullableNumber(
      bytesMetric?.value || row.bytes_per_track || row.bytesPerTrack,
    ),
    judgmentCount: Math.max(
      asNumber(row.judgment_count || row.judgmentCount),
      ...[accepted, ndcg, triplet]
        .map((item) => asNumber(item?.sample_count))
        .filter((value) => value > 0),
    ),
  };
}

export async function loadSimilarityLab(
  requestedEvaluationSetId?: string,
): Promise<SimilarityLabSnapshot> {
  const setsPayload = asRecord(await getJson("/evaluation-sets"));
  const sets = asArray(setsPayload.evaluation_sets || setsPayload.sets).map(normalizeSet);
  if (!sets.length) throw new Error("No evaluation sets exist yet");

  const preferredId =
    requestedEvaluationSetId || process.env.NEXT_PUBLIC_SIMILARITY_LAB_EVALUATION_SET_ID;
  const activeSet = sets.find((set) => set.id === preferredId) || sets[0];
  const detailPayload = await getJson(`/evaluation-sets/${activeSet.id}`);
  const [roundPayload, reportPayload] = await Promise.all([
    getJson(`/evaluation-sets/${activeSet.id}/next`).catch(() => ({})),
    getJson(`/evaluation-sets/${activeSet.id}/report`).catch(() => ({})),
  ]);
  const detail = asRecord(detailPayload);
  const round = asRecord(roundPayload);
  const report = asRecord(reportPayload);
  const roundConfigurations = asArray(round.configurations);
  const detailConfigurations = asArray(detail.configurations);
  const anchors = asArray(detail.anchors).map(normalizeAnchor);
  const roundAnchorTrackId = normalizeTrack(round.anchor).id;
  const orderedAnchors = roundAnchorTrackId
    ? [
        ...anchors.filter((anchor) => anchor.track.id === roundAnchorTrackId),
        ...anchors.filter((anchor) => anchor.track.id !== roundAnchorTrackId),
      ]
    : anchors;

  return {
    source: "api",
    sourceMessage: "Live local evaluation data",
    evaluationSets: sets,
    activeSet: normalizeSet(detail.evaluation_set || detail.set || detail || activeSet),
    anchors: orderedAnchors,
    configurations: (roundConfigurations.length
      ? roundConfigurations
      : detailConfigurations
    ).map(normalizeConfiguration),
    rankings: asArray(
      round.rankings || round.results || round.configurations,
    ).map(normalizeRanking),
    metrics: asArray(report.configurations || report.metrics).map(normalizeMetric),
  };
}

export async function loadEvaluationRound(
  evaluationSetId: string,
  anchorId: string,
  configurationIds: string[],
): Promise<Pick<SimilarityLabSnapshot, "rankings">> {
  const query = new URLSearchParams({ anchor_id: anchorId });
  configurationIds.forEach((id) => query.append("configuration_ids", id));
  const payload = asRecord(
    await getJson(`/evaluation-sets/${evaluationSetId}/next?${query.toString()}`),
  );
  return {
    rankings: asArray(
      payload.rankings || payload.results || payload.configurations,
    ).map(normalizeRanking),
  };
}

export async function saveSimilarityJudgment(
  evaluationSetId: string,
  input: SaveJudgmentInput,
): Promise<void> {
  const response = await fetch(
    `${LOCAL_API_URL}/evaluation-sets/${evaluationSetId}/judgments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluator_id: "local",
        idempotency_key: crypto.randomUUID(),
        judgment_type: "top_k",
        dimension: input.dimension,
        anchor_track_id: input.anchorTrackId,
        candidate_a_track_id: input.candidateTrackId,
        configuration_id: input.configurationId,
        rank_position: input.rank,
        decision: input.judgment,
        blind: input.blind,
        notes: input.notes || "",
      }),
    },
  );
  if (!response.ok) throw new Error(`Could not save judgment (${response.status})`);
}

const sampleTracks = [
  ["s-01", "Salt Flats (Dub)", "Anaïs Kerr"],
  ["s-02", "Nocturne Transit", "Kaito Bloom"],
  ["s-03", "Low Ceiling", "Sordid Palm"],
  ["s-04", "Amber Room", "Lux Verdier"],
  ["s-05", "Grain Cathedral", "Mira Coil"],
  ["s-06", "Static Orchard", "Neon Laurel"],
  ["s-07", "Under Current", "Miel Fontaine"],
  ["s-08", "Soft Relay", "Portico North"],
] as const;

const track = (index: number): LabTrack => {
  const item = sampleTracks[index % sampleTracks.length];
  return { id: item[0], title: item[1], artist: item[2], durationSec: 330 + index * 17, previewUrl: null };
};

function sampleCandidates(offset: number, reasons: string[]): RankedCandidate[] {
  return [0, 1, 2, 3].map((index) => ({
    id: `candidate-${offset}-${index}`,
    track: track(index + offset),
    rank: index + 1,
    score: 0.94 - index * 0.045 + offset * 0.006,
    confidence: 0.88 - index * 0.04,
    reasonCodes: [reasons[index % reasons.length], index % 2 ? "similar low-mid weight" : "matched transient density"],
    channelScores: [
      { channel: "palette", label: "Palette", score: 0.91 - index * 0.04 },
      { channel: "groove", label: "Groove", score: 0.86 - index * 0.03 },
      { channel: "production", label: "Space", score: 0.82 - index * 0.025 },
    ],
    judgment: null,
  }));
}

export function createSampleSimilarityLab(message: string): SimilarityLabSnapshot {
  const evaluationSet: EvaluationSetSummary = {
    id: "sample-pilot-v1",
    name: "Sonic pilot · 8 anchors",
    version: "1",
    description: "A compact blind retrieval bake-off across broad sound worlds.",
    anchorCount: 8,
    completedAnchors: 2,
    hiddenMetadata: true,
  };
  const configs: RetrievalConfiguration[] = [
    {
      id: "discogs-effnet",
      name: "Discogs EffNet",
      version: "discogs-multi-v1",
      role: "Global sound world",
      description: "Music-specific scene and production gestalt.",
      channels: ["global", "palette", "production"],
      status: "ready",
    },
    {
      id: "laion-clap",
      name: "LAION CLAP",
      version: "music-probes-v2",
      role: "Named palette",
      description: "Audio-text palette and production descriptors.",
      channels: ["palette", "texture", "production"],
      status: "ready",
    },
    {
      id: "librosa-physical",
      name: "Physical baseline",
      version: "librosa-fast-v1",
      role: "DSP control",
      description: "Normalized spectral, onset, energy, and dynamics features.",
      channels: ["groove", "brightness", "low-end"],
      status: "ready",
    },
  ];
  return {
    source: "sample",
    sourceMessage: message,
    evaluationSets: [evaluationSet],
    activeSet: evaluationSet,
    anchors: Array.from({ length: 8 }, (_, index) => ({
      id: `anchor-${index + 1}`,
      label: `Anchor ${String(index + 1).padStart(2, "0")}`,
      track: track(index + 2),
      judgmentCount: index < 2 ? 8 : index === 2 ? 5 : 0,
      targetJudgments: 8,
      heldOut: index === 7,
    })),
    configurations: configs,
    rankings: [
      {
        configurationId: "discogs-effnet",
        candidates: sampleCandidates(0, ["same sound world", "similar production density"]),
      },
      {
        configurationId: "laion-clap",
        candidates: sampleCandidates(2, ["shared dry percussion", "warm supporting pads"]),
      },
      {
        configurationId: "librosa-physical",
        candidates: sampleCandidates(4, ["matched onset density", "similar low-end weight"]),
      },
    ],
    metrics: [
      { configurationId: "discogs-effnet", acceptedAt10: 0.72, ndcgAt10: 0.68, tripletAccuracy: 0.71, runtimePerAudioMinute: 0.18, failureRate: 0.004, bytesPerTrack: 5120, judgmentCount: 42 },
      { configurationId: "laion-clap", acceptedAt10: 0.67, ndcgAt10: 0.71, tripletAccuracy: 0.76, runtimePerAudioMinute: 0.73, failureRate: 0.008, bytesPerTrack: 2048, judgmentCount: 42 },
      { configurationId: "librosa-physical", acceptedAt10: 0.49, ndcgAt10: 0.45, tripletAccuracy: 0.52, runtimePerAudioMinute: 0.09, failureRate: 0.002, bytesPerTrack: 896, judgmentCount: 42 },
    ],
  };
}
