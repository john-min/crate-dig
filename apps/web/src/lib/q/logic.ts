import { interpretQPrompt } from "@/lib/studio/q-intent";
import type { ParsedQRequest, QModelOutput } from "./schema";
import type { QFilterPatch, QProvider, QResponse } from "./types";

export class QConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QConfigurationError";
  }
}

type QEnv = {
  Q_PROVIDER?: string;
  GROQ_API_KEY?: string;
};

export function selectedProvider(env: QEnv = process.env as QEnv): QProvider {
  const configured = env.Q_PROVIDER?.trim().toLowerCase();
  if (configured && configured !== "groq" && configured !== "local") {
    throw new QConfigurationError("Q_PROVIDER must be either groq or local.");
  }
  if (configured === "groq") return "groq";
  if (configured === "local") return "local";
  return env.GROQ_API_KEY?.trim() ? "groq" : "local";
}

function clampBpm(value: number, bounds: { min: number; max: number }): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

export function filtersFromModel(
  output: QModelOutput["filters"],
  bounds: { min: number; max: number },
): QFilterPatch {
  const patch: QFilterPatch = {};
  if (output.bpmMin != null || output.bpmMax != null) {
    const min = clampBpm(output.bpmMin ?? bounds.min, bounds);
    const max = clampBpm(output.bpmMax ?? bounds.max, bounds);
    patch.bpmMin = Math.min(min, max);
    patch.bpmMax = Math.max(min, max);
  }
  if (output.keys.length) patch.keys = output.keys;
  if (output.moods.length) patch.moods = output.moods;
  if (output.textures.length) patch.textures = output.textures;
  if (output.energies.length) patch.energies = output.energies;
  return patch;
}

export function evidenceFromFilters(filters: QFilterPatch): string[] {
  const chips: string[] = [];
  if (filters.bpmMin != null && filters.bpmMax != null) {
    chips.push(
      filters.bpmMin === filters.bpmMax
        ? `${filters.bpmMin} BPM`
        : `${filters.bpmMin}–${filters.bpmMax} BPM`,
    );
  }
  if (filters.keys?.length) chips.push(filters.keys.join(" · "));
  const vibe = [...(filters.moods ?? []), ...(filters.textures ?? []), ...(filters.energies ?? [])];
  if (vibe.length) chips.push(vibe.join(" · "));
  return chips;
}

function keywordScore(prompt: string, candidate: ParsedQRequest["candidates"][number]): number {
  const text = prompt.toLowerCase();
  let score = candidate.score;
  const matches = [candidate.mood, candidate.energy, candidate.genre, ...candidate.textures].filter(
    (value) => text.includes(value.toLowerCase()),
  ).length;
  score += matches * 0.08;
  if (/dark|darker|afterhours|late|warehouse/.test(text) && candidate.mood === "dark") score += 0.12;
  if (/warm|sunset|warm[ -]?up|opening|lounge/.test(text) && candidate.mood === "warm") score += 0.12;
  if (/low|lower|down|gentle/.test(text) && candidate.energy === "low") score += 0.1;
  if (/lift|peak|up|driving/.test(text) && ["peak", "driving"].includes(candidate.energy)) score += 0.1;
  const bpmMatch =
    text.match(/around\s+(\d{2,3})/) ?? text.match(/(\d{2,3})\s*bpm/) ?? text.match(/\b(1[0-4]\d)\b/);
  if (bpmMatch && candidate.bpm != null) {
    const center = Number(bpmMatch[1]);
    const delta = Math.abs(candidate.bpm - center);
    if (delta <= 4) score += 0.16;
    else if (delta <= 8) score += 0.08;
  }
  return score;
}

function localReason(candidate: ParsedQRequest["candidates"][number]): string {
  const traits = [
    `${Math.round(candidate.score * 100)}% nearby`,
    `${candidate.mood} mood`,
    `${candidate.energy} energy`,
    candidate.textures[0] ? `${candidate.textures[0]} texture` : null,
    candidate.bpm == null ? null : `${Math.round(candidate.bpm)} BPM`,
    candidate.key || null,
  ].filter(Boolean);
  return traits.slice(0, 4).join(" · ");
}

function localFilters(input: ParsedQRequest): QModelOutput["filters"] {
  const parsed = interpretQPrompt(input.prompt, input.context.bpmBounds).filters;
  return {
    bpmMin: parsed.bpmMin ?? null,
    bpmMax: parsed.bpmMax ?? null,
    keys: parsed.keys ?? [],
    moods: parsed.moods ?? [],
    textures: parsed.textures ?? [],
    energies: parsed.energies ?? [],
  };
}

export function localOutput(input: ParsedQRequest): QModelOutput {
  const ranked = [...input.candidates]
    .sort((a, b) => keywordScore(input.prompt, b) - keywordScore(input.prompt, a))
    .slice(0, 6);
  const from = input.context.seedTrackId ? " around your seed" : " in the current view";
  return {
    answer: ranked.length
      ? `I found ${ranked.length} ${ranked.length === 1 ? "record" : "records"}${from}.`
      : "I couldn't find a confident record in the current candidate set.",
    filters: localFilters(input),
    recommendations: ranked.map((candidate, index) => ({
      trackId: candidate.id,
      reason: localReason(candidate),
      blend: index < 3 || candidate.score >= 0.85 ? "safer" : "pivot",
    })),
    suggestedPrompts: [
      "Find darker nearby records",
      "Warm percussive tracks around 122 BPM",
      "Raise energy after this track",
    ],
  };
}

export function joinCards(input: ParsedQRequest, output: QModelOutput): QResponse["cards"] {
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const cards: QResponse["cards"] = [];

  for (const recommendation of output.recommendations) {
    const candidate = byId.get(recommendation.trackId);
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    cards.push({
      trackId: candidate.id,
      title: candidate.title,
      artist: candidate.artist,
      score: candidate.score,
      bpm: candidate.bpm,
      key: candidate.key,
      reason: recommendation.reason,
      blend: recommendation.blend,
    });
  }

  return cards.slice(0, 8);
}

export function qPromptFor(input: ParsedQRequest): string {
  return [
    "Return structured filters and compact recommendations for the DJ's latest request.",
    "Prefer 3–6 recommendations when the candidates support them.",
    "Every recommendation reason must cite concrete supplied evidence such as mood, texture, energy, BPM, key, cluster, or suggested moment.",
    "Library BPM bounds and conversation follow as JSON:",
    JSON.stringify(
      {
        latestRequest: input.prompt,
        recentConversation: input.history,
        currentContext: input.context,
        candidateTracks: input.candidates,
      },
      null,
      2,
    ),
  ].join("\n\n");
}

export function toQResponse(
  input: ParsedQRequest,
  output: QModelOutput,
  provider: QProvider,
): QResponse {
  const filters = filtersFromModel(output.filters, input.context.bpmBounds);
  return {
    answer: output.answer,
    cards: joinCards(input, output),
    suggestedPrompts: output.suggestedPrompts.slice(0, 3),
    provider,
    filters,
    evidence: evidenceFromFilters(filters),
  };
}
