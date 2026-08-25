"use client";

import { useStudio } from "./StudioProvider";
import { formatBpm, formatKey, formatScore } from "@/lib/studio/format";
import { IconClose } from "./icons";

export function QPanel({ overlay = false }: { overlay?: boolean }) {
  const s = useStudio();

  if (!s.qOpen) {
    return null;
  }

  return (
    <aside
      className={`flex h-full min-h-0 flex-col bg-[var(--panel)] transition-[transform,opacity] duration-[var(--duration-panel)] ease-[var(--ease-panel)] ${
        overlay
          ? "absolute inset-y-0 right-0 z-30 w-[min(24rem,100%)] border-l border-line shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          : "border-l border-line"
      }`}
      aria-label="Q assistant"
    >
      <div className="flex h-12 items-center justify-between px-4">
        <p className="text-[14px] font-medium text-violet">Q</p>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-paper-dim hover:text-paper"
          aria-label="Close Q"
          onClick={s.closeQ}
        >
          <IconClose />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <QBody />
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          s.askQ();
        }}
      >
        <label className="sr-only" htmlFor="q-ask">
          Ask Q
        </label>
        <input
          id="q-ask"
          value={s.qPrompt}
          onChange={(e) => s.setQPrompt(e.target.value)}
          placeholder="Ask Q for records, transitions, or crate shape…"
          className="h-10 w-full rounded-md border border-line bg-ink-raised px-3 text-[14px] outline-none placeholder:text-muted focus:border-amber/40"
        />
      </form>
    </aside>
  );
}

function QBody() {
  const s = useStudio();
  const status = s.qStatus;

  if (status === "loading") {
    return <p className="font-serif text-[1.35rem] leading-snug">Q is listening for nearby records…</p>;
  }

  if (status === "failure") {
    return (
      <div>
        <p className="font-serif text-[1.35rem] leading-snug">Q couldn’t finish that search.</p>
        <p className="mt-3 text-[14px] leading-6 text-paper-dim">
          Your library and crate are unchanged. Try again, or narrow by BPM, key, or mood.
        </p>
        <button
          type="button"
          className="mt-4 h-9 rounded-full border border-line px-3 text-[13px] hover:border-amber/40"
          onClick={() => s.askQ(s.qPrompt || "Find nearby records")}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "no-results") {
    return (
      <div>
        <p className="font-serif text-[1.35rem] leading-snug">Q didn’t find a confident match.</p>
        <p className="mt-3 text-[14px] leading-6 text-paper-dim">
          Blocked by {s.filterCount ? "active filters" : "the current seed and key window"}. Loosen
          BPM, include adjacent keys, or search the whole library.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <QAction onClick={() => s.setFilters({ ...s.filters, bpmNearSeed: false })}>
            Loosen BPM
          </QAction>
          <QAction onClick={() => s.setFilters({ ...s.filters, compatibleKeys: false, keys: [] })}>
            Include adjacent keys
          </QAction>
          <QAction onClick={() => s.setFilters({ ...s.filters, moods: [] })}>Remove mood filter</QAction>
          <QAction onClick={() => { s.clearFilters(); s.setSeed(null); }}>Search entire library</QAction>
        </div>
      </div>
    );
  }

  if (status === "multi") {
    return (
      <div>
        <p className="font-serif text-[1.35rem] leading-snug">
          These {s.selectedIds.length} records share a dry, clipped kick and minor-key pressure.
        </p>
        <p className="mt-3 text-[14px] leading-6 text-paper-dim">
          Six form a peak-time run; three lean tougher and may work better afterhours.
        </p>
        <CardList />
      </div>
    );
  }

  if (status === "crate" && s.activeCrate) {
    return (
      <div>
        <p className="font-serif text-[1.35rem] leading-snug">Two gaps and one ending problem.</p>
        <p className="mt-3 text-[14px] leading-6 text-paper-dim">
          “{s.activeCrate.name}” dips at minute 22, clashes at track 9 → 10, and ends 2 BPM below your
          handover target.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <QAction onClick={() => s.askQ("Find a bridge record")}>Ask Q for a bridge</QAction>
        </div>
      </div>
    );
  }

  if (status === "track" && (s.primarySelected || s.seed)) {
    const from = s.primarySelected ?? s.seed!;
    return (
      <div>
        <p className="font-serif text-[1.35rem] leading-snug">
          Q found {s.qCards.length || s.candidates.length} nearby records.
        </p>
        <p className="mt-3 text-[14px] leading-6 text-paper-dim">
          Same low-mid movement, compatible keys, and warm percussion around “{from.title}”. Three are
          safer blends; two are better pivots.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <QAction onClick={() => s.qCards[0] && s.play(s.qCards[0].trackId)}>Preview all</QAction>
          <QAction onClick={() => s.qCards[0] && s.selectTrack(s.qCards[0].trackId)}>Reveal on map</QAction>
          <QAction onClick={() => s.askQ("Find darker nearby")}>Find darker nearby</QAction>
          <QAction onClick={() => s.askQ("Find safer blends")}>Find safer blends</QAction>
          <QAction onClick={() => s.askQ("Find energy lift")}>Find energy lift</QAction>
        </div>
        <CardList />
      </div>
    );
  }

  return (
    <div>
      <p className="font-serif text-[1.35rem] leading-snug">Where are we digging tonight?</p>
      <p className="mt-3 text-[14px] leading-6 text-paper-dim">
        Select a record, lasso a region, or describe the moment. Q will return records and actions, not
        a chat thread.
      </p>
      <ul className="mt-8 flex flex-col gap-2">
        {[
          "Find darker options near this",
          "Give me 3 safe transitions",
          "Build a 45-minute warm-up crate",
          "Show overlooked records in this cluster",
        ].map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => {
                s.setQPrompt(prompt);
                s.askQ(prompt);
              }}
              className="w-full rounded-lg border border-line px-3 py-2.5 text-left text-[13px] leading-snug text-paper-dim hover:border-amber/35 hover:text-paper"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[12px] leading-5 text-muted">
        Web demo · Q uses library metadata only. Audio files are not sent.
      </p>
    </div>
  );
}

function CardList() {
  const s = useStudio();
  const cards = s.qCards.length
    ? s.qCards
    : s.candidates.slice(0, 6).map((t) => ({
        trackId: t.id,
        title: t.title,
        artist: t.artist,
        score: s.scoreFor(t) ?? 0.8,
        bpm: t.bpm,
        key: t.key,
        reason: "Nearby on the map, worth a preview.",
        blend: "safer" as const,
      }));

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.trackId} className="rounded-lg border border-line px-3 py-3">
          <p className="text-[14px] font-medium text-paper">{card.title}</p>
          <p className="text-[13px] text-paper-dim">{card.artist}</p>
          <p className="mt-1 tabular text-[12px] text-muted">
            {formatScore(card.score)} match · {formatBpm(card.bpm)} BPM · {formatKey(card.key)} ·{" "}
            {card.blend === "safer" ? "safer blend" : "pivot"}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-paper-dim">{card.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <QAction onClick={() => s.play(card.trackId)}>Play</QAction>
            <QAction onClick={() => s.selectTrack(card.trackId)}>Reveal on map</QAction>
            <QAction onClick={() => s.addToCrate(card.trackId)}>Add selected to crate</QAction>
            <QAction onClick={() => s.hideFromRecs(card.trackId)}>Hide from this search</QAction>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-full border border-line px-3 text-[12px] text-paper hover:border-amber/40"
    >
      {children}
    </button>
  );
}
