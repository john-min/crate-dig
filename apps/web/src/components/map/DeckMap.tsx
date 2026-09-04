"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import fixture from "@/data/synthetic-tracks-3k.json";
import type { MapTrack } from "@/lib/types/track";
import type { ColorBy, MapCanvasProps, PlotTrack } from "./types";
import { toPlotTracks } from "./normalize";
import { clusterIslands, largestIslands } from "./cluster-islands";
import { dimFill, fieldFill, GLOW_FILL_ALPHA, glowFill, HIGHLIGHT, neighborFill, trackFill } from "./colors";
import { createNebulaAtlas, NEBULA_ICON, NEBULA_MAPPING } from "./nebula-atlas";
import { fitTracksToView } from "./fitView";
import {
  FIELD_RADIUS_MIN_PX,
  FIELD_RADIUS_PX,
  glowRadiusForTrack,
  isNeighborScore,
  PLAYING_RADIUS_PX,
  radiusForTrack,
  SEED_RADIUS_PX,
  SELECTED_RADIUS_PX,
} from "./radius";

/** Tunable visual treatment — keep these together. */
const LABEL_TOP_N = 6;
const LABEL_NAME_SIZE = 10;
const LABEL_COUNT_SIZE = 9;
const LABEL_NAME_ALPHA = 102;
const LABEL_COUNT_ALPHA = 52;
const NEBULA_ALPHA = 8;
const NEBULA_SIZE_MULT = 1.45;
const NEBULA_MIN_PX = 16;
const NEBULA_MAX_PX = 56;
const FIT_ZOOM_OUT = 0.14;
const PICKING_RADIUS_PX = 10;

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

function trackedLabel(name: string): string {
  return name.split("").join(" ");
}

export default function DeckMap({
  tracks,
  selectedTrackId = null,
  playingTrackId = null,
  seedTrackIds,
  visibleIds,
  colorBy: colorByProp,
  scores,
  onSelectTrack,
  onHoverTrack,
  onWebgl,
  fitRequestKey = 0,
  className = "",
}: MapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [userView, setUserView] = useState<OrthographicViewState | null>(null);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [nebulaAtlas, setNebulaAtlas] = useState<string | null>(null);

  const usingFixture = !tracks?.length;
  const plotTracks = useMemo(() => {
    const source = usingFixture ? (fixture.tracks as MapTrack[]) : tracks!;
    return toPlotTracks(source);
  }, [tracks, usingFixture]);

  const colorBy: ColorBy = colorByProp ?? "cluster";
  const selectedId = selectedTrackId ?? internalSelected;
  const playingId = playingTrackId;
  const seedIds = useMemo(() => new Set(seedTrackIds ?? []), [seedTrackIds]);
  const hasSeed = seedIds.size > 0;

  const { visible, dimmed } = useMemo(() => {
    if (!visibleIds) return { visible: plotTracks, dimmed: [] as PlotTrack[] };
    const vis: PlotTrack[] = [];
    const dim: PlotTrack[] = [];
    for (const track of plotTracks) {
      if (visibleIds.has(track.id)) vis.push(track);
      else dim.push(track);
    }
    return { visible: vis, dimmed: dim };
  }, [plotTracks, visibleIds]);

  const seeds = useMemo(() => plotTracks.filter((t) => seedIds.has(t.id)), [plotTracks, seedIds]);
  const playing = useMemo(
    () => plotTracks.filter((t) => t.id === playingId),
    [plotTracks, playingId],
  );
  const selectedArr = useMemo(
    () => plotTracks.filter((t) => t.id === selectedId),
    [plotTracks, selectedId],
  );

  const islands = useMemo(() => clusterIslands(visible), [visible]);
  const labels = useMemo(() => largestIslands(islands, LABEL_TOP_N), [islands]);

  const dataKey = `${plotTracks.length}:${size.width.toFixed(0)}x${size.height.toFixed(0)}:fit-${fitRequestKey}`;
  const fitted = useMemo(
    () => fitTracksToView(plotTracks, size.width, size.height),
    [plotTracks, size.height, size.width],
  );
  const fittedView = useMemo(
    () =>
      ({
        target: fitted.target,
        zoom: fitted.zoom - FIT_ZOOM_OUT,
        minZoom: -3,
        maxZoom: 8,
      }) as OrthographicViewState,
    [fitted.target, fitted.zoom],
  );
  const viewState: OrthographicViewState =
    userView && viewKey === dataKey ? userView : fittedView;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const atlas = createNebulaAtlas();
    setNebulaAtlas(atlas?.toDataURL("image/png") ?? null);
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const ok = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
      onWebgl?.(ok);
    } catch {
      onWebgl?.(false);
    }
    // Detect once on mount; parent toggle is the list-fallback control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFit = useCallback(() => {
    setUserView({
      target: fitted.target,
      zoom: fitted.zoom - FIT_ZOOM_OUT,
      minZoom: -3,
      maxZoom: 8,
    });
    setViewKey(dataKey);
  }, [dataKey, fitted.target, fitted.zoom]);

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
      onHoverTrack?.(track?.raw ?? null, { x: info.x, y: info.y });
    },
    [onHoverTrack],
  );

  const onClick = useCallback(
    (info: PickingInfo<PlotTrack>) => {
      select(info.object?.id ?? null);
    },
    [select],
  );

  const scoreOf = useCallback(
    (id: string) => scores?.[id] ?? null,
    [scores],
  );

  const layers = useMemo(() => {
    const common = {
      pickable: false,
      radiusUnits: "pixels" as const,
      radiusMinPixels: FIELD_RADIUS_MIN_PX,
      antialiasing: true,
    };
    const hasScores = Boolean(scores && Object.keys(scores).length);
    const fillKey = `${colorBy}:${hasScores}:${Object.keys(scores ?? {}).length}:${hasSeed}`;
    const glowing = hasSeed
      ? visible.filter((track) => seedIds.has(track.id) || isNeighborScore(scoreOf(track.id)))
      : [];

    return [
      nebulaAtlas
        ? new IconLayer({
            id: "cluster-fields",
            data: labels,
            iconAtlas: nebulaAtlas,
            iconMapping: NEBULA_MAPPING,
            getIcon: () => NEBULA_ICON,
            getPosition: (d: { x: number; y: number }) => [d.x, d.y],
            getSize: (d: { coreRadius: number }) => d.coreRadius * NEBULA_SIZE_MULT,
            sizeUnits: "common",
            sizeMinPixels: NEBULA_MIN_PX,
            sizeMaxPixels: NEBULA_MAX_PX,
            getColor: (d: { color: [number, number, number] }) => [...d.color, NEBULA_ALPHA],
            alphaCutoff: 0.004,
            pickable: false,
          })
        : null,
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-dim",
        data: dimmed,
        getPosition: (d) => [d.x, d.y],
        getRadius: FIELD_RADIUS_PX,
        getFillColor: dimFill(),
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-glow",
        data: glowing,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => glowRadiusForTrack(scoreOf(d.id)),
        getFillColor: (d) => glowFill(d, colorBy, scoreOf(d.id), GLOW_FILL_ALPHA),
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-base",
        data: visible,
        pickable: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => radiusForTrack(scoreOf(d.id)),
        getFillColor: (d) =>
          isNeighborScore(scoreOf(d.id))
            ? neighborFill(d, colorBy, scoreOf(d.id))
            : fieldFill(d, colorBy, scoreOf(d.id)),
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-seed",
        data: seeds,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: SEED_RADIUS_PX,
        getFillColor: (d) => trackFill(d, colorBy, 255, scoreOf(d.id)),
        getLineColor: [...HIGHLIGHT.seed, 240],
        getLineWidth: 1.25,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-playing",
        data: playing,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: PLAYING_RADIUS_PX,
        getFillColor: [...HIGHLIGHT.playing, 230],
        getLineColor: [232, 224, 210, 220],
        getLineWidth: 1.25,
        lineWidthUnits: "pixels",
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-selected",
        data: selectedArr,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: SELECTED_RADIUS_PX,
        getFillColor: (d) => trackFill(d, colorBy, 255, scoreOf(d.id)),
        getLineColor: [...HIGHLIGHT.selected, 255],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: fillKey },
      }),
      new TextLayer({
        id: "cluster-label-names",
        data: labels,
        getPosition: (d: { x: number; y: number }) => [d.x, d.y],
        getText: (d: { name: string }) => trackedLabel(d.name),
        getSize: LABEL_NAME_SIZE,
        getColor: (d: { color: [number, number, number] }) => [...d.color, LABEL_NAME_ALPHA],
        getPixelOffset: [0, -8],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Instrument Sans, ui-sans-serif, sans-serif",
        fontSettings: { sdf: false },
        pickable: false,
      }),
      new TextLayer({
        id: "cluster-label-counts",
        data: labels,
        getPosition: (d: { x: number; y: number }) => [d.x, d.y],
        getText: (d: { n: number }) => `${d.n.toLocaleString()} records`,
        getSize: LABEL_COUNT_SIZE,
        getColor: [91, 99, 115, LABEL_COUNT_ALPHA],
        getPixelOffset: [0, 7],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Instrument Sans, ui-sans-serif, sans-serif",
        fontSettings: { sdf: false },
        pickable: false,
      }),
    ].filter(Boolean);
  }, [colorBy, dimmed, hasSeed, labels, nebulaAtlas, playing, scoreOf, scores, seedIds, seeds, selectedArr, visible]);

  const panZoom = useCallback(
    (event: React.KeyboardEvent) => {
      const vs = viewState;
      const zoom = typeof vs.zoom === "number" ? vs.zoom : 0;
      const target = (vs.target ?? [0, 0, 0]) as [number, number, number];
      const step = 0.35 / Math.pow(2, zoom);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setUserView({ ...vs, target: [target[0] - step, target[1], 0], zoom, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setUserView({ ...vs, target: [target[0] + step, target[1], 0], zoom, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setUserView({ ...vs, target: [target[0], target[1] + step, 0], zoom, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setUserView({ ...vs, target: [target[0], target[1] - step, 0], zoom, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setUserView({ ...vs, target, zoom: zoom + 0.4, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setUserView({ ...vs, target, zoom: zoom - 0.4, minZoom: -3, maxZoom: 8 });
        setViewKey(dataKey);
      } else if (event.key === "Home") {
        event.preventDefault();
        applyFit();
      }
    },
    [applyFit, dataKey, viewState],
  );

  return (
    <div
      ref={wrapRef}
      className={`cd-canvas relative h-full min-h-0 w-full overflow-hidden ${className}`}
      tabIndex={0}
      aria-label="Library map. Arrow keys pan, plus and minus zoom, Home fits the view."
      onKeyDown={panZoom}
    >
      <DeckGL
        views={VIEW}
        viewState={viewState}
        onViewStateChange={({ viewState: next }) => {
          setUserView(next as OrthographicViewState);
          setViewKey(dataKey);
        }}
        layers={layers}
        pickingRadius={PICKING_RADIUS_PX}
        onHover={onHover}
        onClick={onClick}
        getCursor={({ isHovering, isDragging }) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "default"
        }
        style={{ background: "transparent" }}
      />
    </div>
  );
}
