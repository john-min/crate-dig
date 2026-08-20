import type { Metadata } from "next";
import { MapCanvas } from "@/components/map/MapCanvas";

export const metadata: Metadata = { title: "Map" };

/** Ungated Deck.gl map demo using the synthetic 3k fixture. */
export default function MapDemoPage() {
  return (
    <main className="h-dvh w-full bg-ink">
      <MapCanvas />
    </main>
  );
}
