import type { MapTrack } from "@/lib/types/track";

export type ColorBy = "cluster" | "mood";

export type MapFilters = {
  bpmMin?: number;
  bpmMax?: number;
  /** Empty or undefined = all clusters. */
  clusters?: number[] | null;
  /** Empty or undefined = all moods. Case-insensitive. */
  moods?: string[] | null;
};

export type MapCanvasProps = {
  tracks?: MapTrack[];
  selectedTrackId?: string | null;
  playingTrackId?: string | null;
  seedTrackIds?: string[];
  filters?: MapFilters;
  colorBy?: ColorBy;
  onFiltersChange?: (filters: MapFilters) => void;
  onSelectTrack?: (trackId: string | null) => void;
  onHoverTrack?: (track: MapTrack | null) => void;
  className?: string;
};

export type PlotTrack = {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  key: string;
  mood: string;
  x: number;
  y: number;
  cluster: number;
  clusterName: string;
  suggestedMoment: string;
  raw: MapTrack;
};

export type Rgba = [number, number, number, number];
