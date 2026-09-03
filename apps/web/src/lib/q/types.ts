export type QProvider = "groq" | "local";

export type QHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type QFilterPatch = {
  bpmMin?: number;
  bpmMax?: number;
  keys?: string[];
  moods?: Array<"warm" | "euphoric" | "dark" | "dreamy" | "hypnotic">;
  textures?: Array<"raw" | "atmospheric" | "minimal" | "percussive" | "vocal">;
  energies?: Array<"low" | "medium" | "peak" | "driving">;
};

export type QCandidate = {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key: string | null;
  genre: string;
  mood: "warm" | "euphoric" | "dark" | "dreamy" | "hypnotic";
  energy: "low" | "medium" | "peak" | "driving";
  textures: Array<"raw" | "atmospheric" | "minimal" | "percussive" | "vocal">;
  clusterName: string;
  suggestedMoment: string;
  score: number;
};

export type QRequest = {
  prompt: string;
  history: QHistoryMessage[];
  context: {
    libraryName: string;
    librarySource: "mock" | "disk" | "cloud" | "preview";
    analysisReady: boolean;
    seedTrackId: string | null;
    selectedTrackIds: string[];
    bpmBounds: { min: number; max: number };
    activeCrate: {
      id: string;
      name: string;
      trackCount: number;
      intention: string;
      room: string;
      timeOfDay: string;
    } | null;
  };
  candidates: QCandidate[];
};

export type QCardPayload = {
  trackId: string;
  title: string;
  artist: string;
  score: number;
  bpm: number | null;
  key: string | null;
  reason: string;
  blend: "safer" | "pivot";
};

export type QResponse = {
  answer: string;
  cards: QCardPayload[];
  suggestedPrompts: string[];
  provider: QProvider;
  filters: QFilterPatch;
  evidence: string[];
};
