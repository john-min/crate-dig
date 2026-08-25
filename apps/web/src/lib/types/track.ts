/** Shared track shape for the map slot. Phase 6 renders these in Deck.gl. */
export type MapTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  bpm?: number | null;
  key?: string;
  genre?: string;
  mood?: string;
  energy?: string;
  x?: number;
  y?: number;
  umap_x?: number;
  umap_y?: number;
  cluster?: number;
  clusterId?: string | number | null;
  clusterName?: string;
  suggestedMoment?: string;
};
