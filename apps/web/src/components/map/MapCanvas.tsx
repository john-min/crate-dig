"use client";

import dynamic from "next/dynamic";
import type { MapCanvasProps } from "./types";

const DeckMap = dynamic(() => import("./DeckMap"), {
  ssr: false,
  loading: () => (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#08090b]">
      <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-serif text-2xl tracking-tight text-paper-dim">
        Map loading
      </p>
    </div>
  ),
});

/** Product map: Deck.gl OrthographicView scatter of analyzed tracks. */
export function MapCanvas(props: MapCanvasProps) {
  return <DeckMap {...props} />;
}

export type { MapCanvasProps } from "./types";
