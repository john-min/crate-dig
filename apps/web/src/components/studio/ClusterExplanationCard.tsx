"use client";

import { CLUSTER_COPY } from "@/lib/studio/constants";
import { useStudio } from "./StudioProvider";

export function ClusterExplanationCard() {
  const s = useStudio();
  if (s.selectedCluster == null) return null;
  const copy = CLUSTER_COPY[s.selectedCluster];
  const count = s.visible.filter((t) => t.cluster === s.selectedCluster).length;
  const name = copy?.name ?? s.visible.find((t) => t.cluster === s.selectedCluster)?.clusterName;
  if (!name) return null;

  return (
    <article className="pointer-events-auto max-w-sm rounded-lg border border-line bg-ink/92 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-[1.25rem] leading-tight tracking-tight">{name}</h2>
        <button
          type="button"
          className="text-[12px] text-muted hover:text-paper"
          onClick={() => s.setSelectedCluster(null)}
        >
          Close
        </button>
      </div>
      <p className="mt-1 tabular text-[12px] text-muted">{count} records in this view</p>
      <p className="mt-2 text-[13px] leading-5 text-paper-dim">
        {copy?.blurb ?? "Grouped by shared audio traits. Names can be edited later."}
      </p>
      <button
        type="button"
        className="mt-3 text-[13px] text-amber hover:text-paper"
        onClick={() => s.openQ()}
      >
        Why these are grouped
      </button>
    </article>
  );
}
