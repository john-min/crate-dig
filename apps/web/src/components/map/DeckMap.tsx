"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import fixture from "@/data/synthetic-tracks-3k.json";
import type { MapTrack } from "@/lib/types/track";
import type { ColorBy, MapCanvasProps, MapFilters, PlotTrack } from "./types";
import { toPlotTracks } from "./normalize";
import { matchesFilters, mergeFilters } from "./filters";
import { dimFill, glowFill, HIGHLIGHT, trackFill } from "./colors";
import { fitTracksToView } from "./fitView";
import { MapOverlays, buildLegend } from "./MapOverlays";

const VIEW = new OrthographicView({
  id: "track-map",
  flipY: false,
  controller: {
    dragPan: true,
    dragRotate: false,
    scrollZoom: { speed: 0.004, smooth: true },
    doubleClickZoom: true,
    touchZoom: true,
    keyboard: false,
  },
});

const EMPTY_FILTERS: MapFilters = {};

export default function DeckMap({
  tracks,
  selectedTrackId = null,
  playingTrackId = null,
  seedTrackIds,
  filters: parentFilters,
  colorBy: colorByProp,
  onSelectTrack,
  onHoverTrack,
  className = "",
}: MapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewState, setViewState] = useState<OrthographicViewState>({
    target: [0, 0, 0],
    zoom: 0,
    minZoom: -3,
    maxZoom: 8,
  });
  const fittedFor = useRef<string | null>(null);

  const usingFixture = !tracks?.length;
  const plotTracks = useMemo(() => {
    const source = usingFixture ? (fixture.tracks as MapTrack[]) : tracks!;
    return toPlotTracks(source);
  }, [tracks, usingFixture]);

  const [localFilters, setLocalFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [localColorBy, setLocalColorBy] = useState<ColorBy>("cluster");
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [internalPlaying, setInternalPlaying] = useState<string | null>(null);
  const [internalSeeds, setInternalSeeds] = useState<string[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; track: PlotTrack } | null>(null);

  const colorBy = colorByProp ?? localColorBy;
  const filters = mergeFilters(parentFilters, localFilters);
  const selectedId = selectedTrackId ?? internalSelected;
  const playingId = playingTrackId ?? internalPlaying;
  const seedIds = useMemo(
    () => new Set(seedTrackIds ?? internalSeeds),
    [seedTrackIds, internalSeeds],
  );

  const selected = useMemo(
    () => plotTracks.find((t) => t.id === selectedId) ?? null,
    [plotTracks, selectedId],
  );

  const { visible, dimmed } = useMemo(() => {
    const vis: PlotTrack[] = [];
    const dim: PlotTrack[] = [];
    for (const track of plotTracks) {
      if (matchesFilters(track, filters)) vis.push(track);
      else dim.push(track);
    }
    return { visible: vis, dimmed: dim };
  }, [plotTracks, filters]);

  const seeds = useMemo(
    () => plotTracks.filter((t) => seedIds.has(t.id)),
    [plotTracks, seedIds],
  );
  const playing = useMemo(
    () => plotTracks.filter((t) => t.id === playingId),
    [plotTracks, playingId],
  );
  const selectedArr = useMemo(
    () => plotTracks.filter((t) => t.id === selectedId),
    [plotTracks, selectedId],
  );

  const legend = useMemo(() => buildLegend(visible, colorBy), [visible, colorBy]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const applyFit = useCallback(
    (force = false) => {
      const key = `${plotTracks.length}:${size.width}x${size.height}`;
      if (!force && fittedFor.current === key) return;
      if (!plotTracks.length || size.width < 8) return;
      fittedFor.current = key;
      const fitted = fitTracksToView(plotTracks, size.width, size.height);
      setViewState((prev) => ({ ...prev, ...fitted }));
    },
    [plotTracks, size.height, size.width],
  );

  useEffect(() => {
    applyFit(false);
  }, [applyFit]);

  const select = useCallback(
    (id: string | null) => {
      setInternalSelected(id);
      onSelectTrack?.(id);
    },
    [onSelectTrack],
  );

  const onHover = useCallback(
    (info: PickingInfo<PlotTrack>) => {
      const track = info.object ?? null;
      if (track) setHover({ x: info.x, y: info.y, track });
      else setHover(null);
      onHoverTrack?.(track?.raw ?? null);
    },
    [onHoverTrack],
  );

  const onClick = useCallback(
    (info: PickingInfo<PlotTrack>) => {
      select(info.object?.id ?? null);
    },
    [select],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const layers = useMemo(() => {
    const common = {
      pickable: false,
      radiusUnits: "pixels" as const,
      radiusMinPixels: 1,
      antialiasing: true,
    };

    return [
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-dim",
        data: dimmed,
        getPosition: (d) => [d.x, d.y],
        getRadius: 2.2,
        getFillColor: dimFill(),
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-glow",
        data: visible,
        getPosition: (d) => [d.x, d.y],
        getRadius: 11,
        getFillColor: (d) => glowFill(d, colorBy),
        updateTriggers: { getFillColor: colorBy },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-base",
        data: visible,
        pickable: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: 4.2,
        getFillColor: (d) => trackFill(d, colorBy),
        updateTriggers: { getFillColor: colorBy },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-seed",
        data: seeds,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: 8,
        getFillColor: (d) => trackFill(d, colorBy, 255),
        getLineColor: [...HIGHLIGHT.seed, 240],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: colorBy },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-playing",
        data: playing,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: 9,
        getFillColor: [...HIGHLIGHT.playing, 230],
        getLineColor: [232, 224, 210, 220],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-selected",
        data: selectedArr,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: 10,
        getFillColor: (d) => trackFill(d, colorBy, 255),
        getLineColor: [...HIGHLIGHT.selected, 255],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: colorBy },
      }),
    ];
  }, [colorBy, dimmed, playing, seeds, selectedArr, visible]);

  return (
    <div
      ref={wrapRef}
      className={`relative h-full min-h-0 w-full overflow-hidden bg-[oklch(0.145_0.012_72)] ${className}`}
    >
      <DeckGL
        views={VIEW}
        viewState={viewState}
        onViewStateChange={({ viewState: next }) =>
          setViewState(next as OrthographicViewState)
        }
        layers={layers}
        onHover={onHover}
        onClick={onClick}
        getCursor={({ isHovering, isDragging }) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "default"
        }
        style={{ background: "transparent" }}
      />
      <div className="pointer-events-none absolute inset-0">
        <MapOverlays
          colorBy={colorBy}
          onColorBy={setLocalColorBy}
          filters={filters}
          onFilters={setLocalFilters}
          visibleCount={visible.length}
          totalCount={plotTracks.length}
          usingFixture={usingFixture}
          legend={legend}
          selected={selected}
          playingId={playingId}
          seedIds={seedIds}
          hover={hover}
          onFit={() => applyFit(true)}
          onClearSelection={() => select(null)}
          onPlay={(track) => setInternalPlaying(track.id)}
          onToggleSeed={(track) => {
            setInternalSeeds((prev) =>
              prev.includes(track.id) ? prev.filter((id) => id !== track.id) : [...prev, track.id],
            );
          }}
        />
      </div>
    </div>
  );
}
