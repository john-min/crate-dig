import type { SimilarityReason } from "@/lib/studio/types";

export function SimilarityReasonStack({
  reasons,
  score,
}: {
  reasons: SimilarityReason[];
  score?: number | null;
}) {
  if (!reasons.length) return null;
  return (
    <div>
      {score != null ? (
        <p className="tabular text-[13px] text-paper">
          {score.toFixed(2)} match
          <span className="ml-2 text-[12px] font-normal text-paper-dim">
            0.80+ is usually worth auditioning
          </span>
        </p>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1">
        {reasons.map((reason) => (
          <li
            key={reason.label}
            className={`text-[13px] leading-5 ${
              reason.kind === "warning" ? "text-amber" : "text-paper-dim"
            }`}
          >
            {reason.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
