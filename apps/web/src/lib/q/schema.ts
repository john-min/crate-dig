import { z } from "zod";

const nullableShortText = z.string().max(120).nullable();
const mood = z.enum(["warm", "euphoric", "dark", "dreamy", "hypnotic"]);
const energy = z.enum(["low", "medium", "peak", "driving"]);
const texture = z.enum(["raw", "atmospheric", "minimal", "percussive", "vocal"]);

export const qRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(1_200),
      }),
    )
    .max(6),
  context: z.object({
    libraryName: z.string().max(160),
    librarySource: z.enum(["mock", "disk", "cloud", "preview"]),
    analysisReady: z.boolean(),
    seedTrackId: nullableShortText,
    selectedTrackIds: z.array(z.string().max(120)).max(40),
    bpmBounds: z.object({
      min: z.number().min(1).max(400),
      max: z.number().min(1).max(400),
    }),
    activeCrate: z
      .object({
        id: z.string().max(120),
        name: z.string().max(160),
        trackCount: z.number().int().min(0).max(100_000),
        intention: z.string().max(500),
        room: z.string().max(160),
        timeOfDay: z.string().max(160),
      })
      .nullable(),
  }),
  candidates: z
    .array(
      z.object({
        id: z.string().max(120),
        title: z.string().max(300),
        artist: z.string().max(240),
        bpm: z.number().min(0).max(400).nullable(),
        key: nullableShortText,
        genre: z.string().max(160),
        mood,
        energy,
        textures: z.array(texture).max(5),
        clusterName: z.string().max(160),
        suggestedMoment: z.string().max(160),
        score: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(48),
});

export const qModelOutputSchema = z.object({
  answer: z.string().min(1).max(900),
  filters: z.object({
    bpmMin: z.number().int().min(1).max(400).nullable(),
    bpmMax: z.number().int().min(1).max(400).nullable(),
    keys: z.array(z.string().max(4)).max(12),
    moods: z.array(mood).max(5),
    textures: z.array(texture).max(5),
    energies: z.array(energy).max(4),
  }),
  recommendations: z
    .array(
      z.object({
        trackId: z.string().max(120),
        reason: z.string().min(1).max(260),
        blend: z.enum(["safer", "pivot"]),
      }),
    )
    .max(8),
  suggestedPrompts: z.array(z.string().min(1).max(120)).max(3),
});

export type ParsedQRequest = z.infer<typeof qRequestSchema>;
export type QModelOutput = z.infer<typeof qModelOutputSchema>;
