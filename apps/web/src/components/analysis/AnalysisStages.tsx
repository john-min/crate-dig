export const ANALYSIS_STAGES = [
  "Reading metadata",
  "Decoding audio",
  "Extracting BPM/key/loudness",
  "Generating audio features",
  "Generating embeddings",
  "Clustering by similarity",
  "Creating waveform/previews",
] as const;

export function AnalysisStages({
  activeIndex = 0,
}: {
  activeIndex?: number;
}) {
  return (
    <ol className="relative flex flex-col gap-0">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-px overflow-hidden bg-line"
      >
        <span
          className="absolute top-0 h-24 w-px bg-amber"
          style={{ animation: "scan 3.6s ease-in-out infinite" }}
        />
      </span>
      {ANALYSIS_STAGES.map((stage, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li key={stage} className="flex items-baseline gap-4 py-3 pl-6">
            <span
              className={`tabular-nums text-[12px] ${
                current ? "text-amber" : "text-muted"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={
                current
                  ? "text-paper"
                  : done
                    ? "text-paper-dim"
                    : "text-muted"
              }
            >
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
