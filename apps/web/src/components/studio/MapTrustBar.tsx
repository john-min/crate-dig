"use client";

import { useStudio } from "./StudioProvider";
import { formatBpm } from "@/lib/studio/format";

export function MapTrustBar() {
  const s = useStudio();
  const total = s.tracks.length;
  const visible = s.visible.length;
  const filtered = visible !== total || s.filterCount > 0;

  let summary: string;
  if (s.seed) {
    const bpm = s.seed.bpm != null ? `${formatBpm(s.seed.bpm)} BPM ±4` : "BPM open";
    summary = `Similar to “${s.seed.title}” · ${s.candidates.length} candidates · ${bpm} · ${
      s.filters.compatibleKeys ? "compatible keys" : "all keys"
    }${s.filterCount ? " · filters on" : ""}.`;
  } else if (filtered) {
    summary = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} records. Hidden records are outside your BPM, mood, or texture filters.`;
  } else if (s.librarySource === "disk") {
    summary = `${visible.toLocaleString()} local files playing from disk. Map positions are placeholders until analysis runs — distance is not sonic similarity yet.`;
  } else {
    summary = `${visible.toLocaleString()} analyzed records arranged by sonic similarity. Nearby records share audio features like rhythm, texture, brightness, low-end weight, tempo, and key movement. Color is currently showing ${s.colorBy}.`;
  }

  return (
    <div
      className="border-b border-[var(--hairline)] bg-[var(--panel)] px-4 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[88ch] text-[11.5px] leading-[17px] text-paper-dim">{summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="tabular text-[11px] text-muted">{s.modelVersion}</p>
          <button
            type="button"
            className="text-[11.5px] text-paper hover:text-amber"
            aria-expanded={s.howToReadOpen}
            onClick={() => s.setHowToReadOpen(!s.howToReadOpen)}
          >
            How to read this
          </button>
        </div>
      </div>
      {s.howToReadOpen ? (
        <div className="mt-2 max-w-[76ch] space-y-1.5 text-[12.5px] leading-[1.6] text-paper-dim">
          <p>
            Distance means sound, not genre. Records closer together share more measured audio traits.
            Color shows the selected dimension. Cluster names are generated from common traits and can
            be edited.
          </p>
          <p>
            This map is a guide for digging, not a verdict. Use preview, BPM, key, and Q’s reason notes
            before adding tracks to a crate.
          </p>
          <p>
            Similarity score compares this record to your selected seed. 1.00 means very close. 0.80+ is
            usually worth auditioning. Scores do not guarantee a clean mix.
          </p>
        </div>
      ) : null}
    </div>
  );
}
