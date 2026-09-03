"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrthographicView, type OrthographicViewState, type PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import fixture from "@/data/synthetic-tracks-3k.json";
import type { MapTrack } from "@/lib/types/track";
import type { ColorBy, MapCanvasProps, PlotTrack } from "./types";
import { toPlotTracks } from "./normalize";
import { clusterRgb, dimFill, glowFill, HIGHLIGHT, trackFill } from "./colors";
import { fitTracksToView } from "./fitView";
import { glowRadiusFromScore, radiusFromScore } from "./radius";

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

  const usingFixture = !tracks?.length;
  const plotTracks = useMemo(() => {
    const source = usingFixture ? (fixture.tracks as MapTrack[]) : tracks!;
    return toPlotTracks(source);
  }, [tracks, usingFixture]);

  const colorBy: ColorBy = colorByProp ?? "mood";
  const selectedId = selectedTrackId ?? internalSelected;
  const playingId = playingTrackId;
  const seedIds = useMemo(() => new Set(seedTrackIds ?? []), [seedTrackIds]);

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

  const labels = useMemo(() => {
    const acc = new Map<number, { name: string; x: number; y: number; n: number; color: [number, number, number] }>();
    for (const track of visible) {
      if (track.cluster < 0) continue;
      const cur = acc.get(track.cluster);
      if (cur) {
        cur.x += track.x;
        cur.y += track.y;
        cur.n += 1;
      } else {
        acc.set(track.cluster, {
          name: track.clusterName.toUpperCase(),
          x: track.x,
          y: track.y,
          n: 1,
          color: clusterRgb(track.cluster),
        });
      }
    }
    return [...acc.values()].map((c) => ({ ...c, x: c.x / c.n, y: c.y / c.n }));
  }, [visible]);

  const dataKey = `${plotTracks.length}:${size.width.toFixed(0)}x${size.height.toFixed(0)}:fit-${fitRequestKey}`;
  const fitted = useMemo(
    () => fitTracksToView(plotTracks, size.width, size.height),
    [plotTracks, size.height, size.width],
  );
  const fittedView = useMemo(
    () =>
      ({
        target: fitted.target,
        zoom: fitted.zoom,
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
    setUserView({ target: fitted.target, zoom: fitted.zoom, minZoom: -3, maxZoom: 8 });
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
      radiusMinPixels: 1.4,
      antialiasing: true,
    };
    const hasScores = Boolean(scores && Object.keys(scores).length);
    const fillKey = `${colorBy}:${hasScores}:${Object.keys(scores ?? {}).length}`;
    const radiusOf = (id: string) => radiusFromScore(scoreOf(id));
    const glowOf = (id: string) => glowRadiusFromScore(scoreOf(id));

    return [
      new ScatterplotLayer({
        id: "cluster-fields",
        data: labels,
        pickable: false,
        radiusUnits: "pixels",
        getPosition: (d: { x: number; y: number }) => [d.x, d.y],
        getRadius: (d: { n: number }) => Math.min(96, 50 + Math.sqrt(d.n) * 2.2),
        getFillColor: (d: { color: [number, number, number] }) => [...d.color, 8],
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-dim",
        data: dimmed,
        getPosition: (d) => [d.x, d.y],
        getRadius: 2.0,
        getFillColor: dimFill(),
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-glow",
        data: visible,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => glowOf(d.id),
        getFillColor: (d) => glowFill(d, colorBy, scoreOf(d.id)),
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-base",
        data: visible,
        pickable: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => radiusOf(d.id),
        getFillColor: (d) => trackFill(d, colorBy, 210, scoreOf(d.id)),
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-seed",
        data: seeds,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => Math.max(radiusOf(d.id), 7.4),
        getFillColor: (d) => trackFill(d, colorBy, 255, scoreOf(d.id)),
        getLineColor: [...HIGHLIGHT.seed, 240],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-playing",
        data: playing,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => Math.max(radiusOf(d.id), 7.8),
        getFillColor: [...HIGHLIGHT.playing, 230],
        getLineColor: [232, 224, 210, 220],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getRadius: fillKey },
      }),
      new ScatterplotLayer<PlotTrack>({
        ...common,
        id: "tracks-selected",
        data: selectedArr,
        stroked: true,
        getPosition: (d) => [d.x, d.y],
        getRadius: (d) => Math.max(radiusOf(d.id), 8.2),
        getFillColor: (d) => trackFill(d, colorBy, 255, scoreOf(d.id)),
        getLineColor: [...HIGHLIGHT.selected, 255],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: fillKey, getRadius: fillKey },
      }),
      new TextLayer({
        id: "cluster-label-names",
        data: labels,
        getPosition: (d: { x: number; y: number }) => [d.x, d.y],
        getText: (d: { name: string }) => d.name,
        getSize: 11,
        getColor: (d: { color: [number, number, number] }) => [...d.color, 205],
        getPixelOffset: [0, -7],
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
        getSize: 11,
        getColor: [91, 99, 115, 185],
        getPixelOffset: [0, 8],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Instrument Sans, ui-sans-serif, sans-serif",
        fontSettings: { sdf: false },
        pickable: false,
      }),
    ];
  }, [colorBy, dimmed, labels, playing, scoreOf, scores, seeds, selectedArr, visible]);

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
