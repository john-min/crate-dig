"use client";

import { useState } from "react";
import { FilterRail } from "@/components/shell/FilterRail";
import { MapCanvas } from "@/components/map/MapCanvas";
import { TrackList } from "@/components/shell/TrackList";
import { QPanel } from "@/components/shell/QPanel";
import { PlayerBar } from "@/components/shell/PlayerBar";
import type { MapFilters } from "@/components/map/types";
import type { MapTrack } from "@/lib/types/track";

export function AppShell({ tracks = [] }: { tracks?: MapTrack[] }) {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilters>({});

  return (
    <div className="grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)_3.5rem] lg:grid-cols-[15.5rem_minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)_11.5rem_3.5rem]">
      <div className="hidden min-h-0 lg:block lg:row-span-2">
        <FilterRail filters={filters} onFiltersChange={setFilters} />
      </div>
      <div className="min-h-0">
        <MapCanvas
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          playingTrackId={playingTrackId}
          filters={filters}
          onSelectTrack={(id) => {
            setSelectedTrackId(id);
            if (id) setPlayingTrackId(id);
          }}
        />
      </div>
      <div className="hidden min-h-0 lg:block lg:row-span-2">
        <QPanel />
      </div>
      <div className="hidden min-h-0 lg:block">
        <TrackList />
      </div>
      <div className="lg:col-span-3">
        <PlayerBar />
      </div>
    </div>
  );
}
