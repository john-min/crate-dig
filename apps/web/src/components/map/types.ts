import type { MapTrack } from "@/lib/types/track";
import type { ColorBy as StudioColorBy } from "@/lib/studio/types";

export type ColorBy = StudioColorBy;

export type MapFilters = {
  bpmMin?: number;
  bpmMax?: number;
  clusters?: number[] | null;
  moods?: string[] | null;
};

export type MapCanvasProps = {
  tracks?: MapTrack[];
  selectedTrackId?: string | null;
  playingTrackId?: string | null;
  seedTrackIds?: string[];
  visibleIds?: Set<string>;
  filters?: MapFilters;
  colorBy?: ColorBy;
  scores?: Record<string, number>;
  onFiltersChange?: (filters: MapFilters) => void;
  onSelectTrack?: (trackId: string | null) => void;
  onHoverTrack?: (track: MapTrack | null) => void;
  onColorBy?: (value: ColorBy) => void;
  onWebgl?: (ok: boolean) => void;
  fitRequestKey?: number;
  className?: string;
};

export type PlotTrack = {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key: string;
  mood: string;
  energy: string;
  x: number;
  y: number;
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  raw: MapTrack;
};

export type Rgba = [number, number, number, number];
