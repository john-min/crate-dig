"use client";

import { useStudio } from "./StudioProvider";

export function MapTrustBar() {
  const s = useStudio();
  const total = s.tracks.length;
  const visible = s.visible.length;
  const qApplied = Boolean(s.qAsk && (s.qStatus === "found" || s.qStatus === "empty"));

  const colorLabel = s.colorBy === "cluster" ? "genre" : s.colorBy;

  let summary: string;
  if (qApplied) {
    summary = `Q applied "${s.qAsk}" — showing ${visible.toLocaleString()} of ${total.toLocaleString()} records, colored by ${colorLabel}`;
  } else {
    summary = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} records · colored by ${colorLabel}`;
    if (s.seed) {
      summary += ` · similar to “${s.seed.title}”`;
    }
    if (s.librarySource === "preview") {
      summary += " · scatter follows sonic analysis · colour marks genre";
    } else if (!s.analysisReady && s.librarySource === "disk") {
      summary += " · map positions are placeholders until analysis — distance is not sonic similarity yet";
    }
  }

  return (
    <div
      className="border-b border-[#171B21] bg-[#0B0D11] px-[18px] py-2.5 text-[12.5px] text-[#B7BEC9]"
      role="status"
      aria-live="polite"
    >
      <p className="max-w-[88ch] leading-[1.45]">{summary}</p>
    </div>
  );
}
