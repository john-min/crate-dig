import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { UploadDropzone } from "@/components/import/UploadDropzone";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <div className="min-h-dvh px-6 py-8 md:px-10">
      <header className="flex items-center justify-between">
        <Wordmark href="/app" />
        <Link href="/app" className="text-sm text-muted hover:text-paper">
          Skip to map
        </Link>
      </header>
      <main className="mx-auto mt-16 max-w-3xl">
        <p className="text-[12px] uppercase tracking-[0.22em] text-muted">Import</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight md:text-5xl">
          Bring the records in
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-paper-dim">
          Web demo uploads stay private. Rekordbox XML parsing is next; this
          shell is the drop target.
        </p>
        <div className="mt-10">
          <UploadDropzone />
        </div>
        <div className="mt-10">
          <Link
            href="/analysis"
            className="inline-flex h-11 items-center rounded-full bg-amber px-6 text-[15px] font-medium text-ink hover:bg-amber/90"
          >
            Continue to analysis
          </Link>
        </div>
      </main>
    </div>
  );
}
