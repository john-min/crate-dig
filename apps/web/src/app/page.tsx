import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { LibraryMapStill } from "@/components/landing/LibraryMapStill";

const LOOP = [
  {
    title: "Explore the demo",
    copy: "Play related tracks and build crates from our curated library. No upload required.",
  },
  {
    title: "Ask Q",
    copy: "Describe the vibe or direction. Q finds fitting tracks and explains the match.",
  },
  {
    title: "Mac app—coming soon",
    copy: "Analyze and explore your own library privately, locally, and offline.",
  },
];

const ctaClassName =
  "h-12 items-center rounded-full bg-amber px-7 text-[15px] font-medium text-[#181203] transition-colors hover:bg-amber/90";

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh">
      <header className="relative z-10 flex items-center justify-between px-5 py-5 md:px-10 md:py-6">
        <Wordmark />
        <nav className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm text-paper-dim transition-colors hover:text-paper"
          >
            Sign in
          </Link>
          <Link
            href="/access"
            className={`hidden h-10 px-5 text-[14px] md:inline-flex ${ctaClassName}`}
          >
            Start digging
          </Link>
        </nav>
      </header>

      <main className="relative z-10 px-5 pb-8 pt-10 md:px-10 md:pt-16">
        <div className="mx-auto max-w-[1240px]">
          <h1 className="max-w-[16ch] font-serif text-[clamp(2.75rem,8vw,4.15rem)] leading-[1.05] tracking-[-0.01em]">
            Find the <em className="italic text-amber">next</em> record.
          </h1>
          <p className="mt-5 max-w-[40rem] text-[17px] leading-[1.6] text-paper-dim text-pretty">
            Explore a curated library mapped by sound. Ask Q where your set should go next.
            Soon, analyze your own collection on Mac.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/access" className={`inline-flex ${ctaClassName}`}>
              Start digging
            </Link>
            <p className="text-sm text-paper-dim">Access code required</p>
          </div>

          <LibraryMapStill className="mt-11 md:mt-12" />
        </div>
      </main>

      <section className="relative z-10 px-5 pb-16 pt-16 md:px-10 md:pb-24 md:pt-24">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="font-serif text-[clamp(1.75rem,4vw,2.125rem)]">How it works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-16">
            {LOOP.map((step) => (
              <li key={step.title}>
                <h3 className="text-[16px] font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 max-w-[36ch] text-[14.5px] leading-relaxed text-paper-dim">
                  {step.copy}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
