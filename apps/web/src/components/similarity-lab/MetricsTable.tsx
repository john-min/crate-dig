import type { ConfigurationMetrics, RetrievalConfiguration } from "@/lib/similarity-lab/similarity-lab-api";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function runtime(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}×`;
}

function bytes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export function MetricsTable({ configurations, metrics }: { configurations: RetrievalConfiguration[]; metrics: ConfigurationMetrics[] }) {
  const byId = Object.fromEntries(metrics.map((metric) => [metric.configurationId, metric]));
  return (
    <section className="border-t border-[var(--hairline)] bg-[var(--panel)]" aria-labelledby="run-metrics-title">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 id="run-metrics-title" className="text-[12.5px] font-semibold text-paper">Run comparison</h2>
          <p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">Judgment quality and operational cost remain separate promotion gates.</p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-tertiary)]">Pilot metrics</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-y border-[var(--hairline)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
              <th className="px-4 py-2 font-semibold">Configuration</th><th className="px-3 py-2 font-semibold">Accepted@10</th><th className="px-3 py-2 font-semibold">nDCG@10</th><th className="px-3 py-2 font-semibold">Triplet</th><th className="px-3 py-2 font-semibold">Runtime / audio min</th><th className="px-3 py-2 font-semibold">Failure</th><th className="px-3 py-2 font-semibold">Stored / track</th><th className="px-4 py-2 text-right font-semibold">Judgments</th>
            </tr>
          </thead>
          <tbody>
            {configurations.map((configuration) => {
              const metric = byId[configuration.id];
              return <tr key={configuration.id} className="border-b border-[var(--hairline)] text-[11.5px] text-[var(--ink-2)] last:border-0"><th className="px-4 py-2.5 font-medium text-paper">{configuration.name}<span className="ml-2 font-normal text-[var(--ink-faint)]">{configuration.version}</span></th><td className="tabular px-3 py-2.5">{percent(metric?.acceptedAt10 ?? null)}</td><td className="tabular px-3 py-2.5">{percent(metric?.ndcgAt10 ?? null)}</td><td className="tabular px-3 py-2.5">{percent(metric?.tripletAccuracy ?? null)}</td><td className="tabular px-3 py-2.5">{runtime(metric?.runtimePerAudioMinute ?? null)}</td><td className="tabular px-3 py-2.5">{percent(metric?.failureRate ?? null)}</td><td className="tabular px-3 py-2.5">{bytes(metric?.bytesPerTrack ?? null)}</td><td className="tabular px-4 py-2.5 text-right">{metric?.judgmentCount ?? 0}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
