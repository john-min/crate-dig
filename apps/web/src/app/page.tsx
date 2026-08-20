import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Constellation } from "@/components/landing/Constellation";

const LOOP = [
  { n: "01", title: "Upload", copy: "Bring in files or a Rekordbox XML." },
  { n: "02", title: "Analyze", copy: "BPM, key, embeddings, clusters." },
  { n: "03", title: "Explore", copy: "Read the library as a map." },
  { n: "04", title: "Ask Q", copy: "Find the next record from context." },
  { n: "05", title: "Build crate", copy: "Save the set moment." },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Constellation className="pointer-events-none absolute inset-y-0 right-[-8%] hidden h-full w-[58%] opacity-80 md:block" />
      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Wordmark />
        <Link
          href="/login"
          className="text-sm text-paper-dim transition-colors hover:text-paper"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 px-6 pb-24 pt-16 md:px-10 md:pt-28">
        <p className="text-[12px] uppercase tracking-[0.22em] text-muted">
          For DJs and collectors
        </p>
        <h1 className="mt-5 max-w-[14ch] font-serif text-[clamp(3.25rem,9vw,6.75rem)] leading-[0.92] tracking-tight">
          Find the next record.
        </h1>
        <p className="mt-8 max-w-md text-[17px] leading-relaxed text-paper-dim">
          Import a library, analyze it, and explore clusters by vibe — then ask Q
          to shape a crate for the room.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/access"
            className="inline-flex h-12 items-center rounded-full bg-amber px-7 text-[15px] font-medium text-ink transition-colors hover:bg-amber/90"
          >
            Start digging
          </Link>
          <p className="text-sm text-muted">Access code required</p>
        </div>
      </main>

      <section className="relative z-10 mt-8 border-t border-line px-6 py-12 md:px-10">
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {LOOP.map((step) => (
            <li key={step.n}>
              <p className="text-[11px] tabular-nums tracking-[0.18em] text-amber-dim">
                {step.n}
              </p>
              <h2 className="mt-2 text-[15px] font-medium">{step.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="relative z-10 px-6 pb-10 text-sm text-muted md:px-10">
        Use it in the browser. Take it offline on Mac.
      </footer>
    </div>
  );
}
