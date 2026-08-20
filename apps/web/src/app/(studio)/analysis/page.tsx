import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { AnalysisStages } from "@/components/analysis/AnalysisStages";

export const metadata: Metadata = { title: "Analysis" };

export default function AnalysisPage() {
  return (
    <div className="min-h-dvh px-6 py-8 md:px-10">
      <header className="flex items-center justify-between">
        <Wordmark href="/app" />
        <Link href="/import" className="text-sm text-muted hover:text-paper">
          Back to import
        </Link>
      </header>
      <main className="mx-auto mt-16 grid max-w-5xl gap-16 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="text-[12px] uppercase tracking-[0.22em] text-muted">
            Analysis
          </p>
          <h1 className="mt-3 font-serif text-4xl tracking-tight md:text-5xl">
            Points forming a map
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-paper-dim">
            Tracks appear on the map after analysis. You can leave this page;
            we&apos;ll notify you when it&apos;s done.
          </p>
          <div className="mt-10">
            <AnalysisStages activeIndex={0} />
          </div>
          <p className="mt-8 text-sm text-muted">
            0 of — tracks · Fast analysis · librosa
          </p>
          <Link
            href="/app"
            className="mt-10 inline-flex h-11 items-center rounded-full border border-line px-6 text-[15px] text-paper hover:bg-ink-hover"
          >
            Open the map
          </Link>
        </div>
        <aside className="hidden lg:block">
          <div className="relative h-80 overflow-hidden rounded-2xl bg-[oklch(0.145_0.012_72)]">
            <div
              aria-hidden
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, oklch(0.93 0.016 82 / 0.1) 1px, transparent 0)",
                backgroundSize: "22px 22px",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-amber/20 to-transparent"
              style={{ animation: "scan 4s ease-in-out infinite" }}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
