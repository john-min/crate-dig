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
      role="complementary"
      className={`flex h-full min-h-0 flex-col bg-[var(--panel)] transition-[transform,opacity] duration-[var(--duration-panel)] ease-[var(--ease-panel)] ${
        overlay
          ? "absolute inset-y-0 right-0 z-30 w-[min(var(--q-panel-width),100%)] border-l border-[var(--hairline)] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          : "border-l border-[var(--hairline)]"
      }`}
      aria-label="Q assistant"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-5 w-5 place-items-center rounded-[6px] border border-violet/35 bg-violet/10 text-[11px] font-semibold text-violet">
            Q
          </span>
          <div>
            <p className="text-[13px] font-semibold text-paper">Q</p>
            <p className="text-[11px] text-muted">Contextual crate assistant</p>
          </div>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-paper-dim hover:text-paper"
          aria-label="Close Q"
          onClick={s.closeQ}
        >
          <IconClose />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <QBody />
      </div>
      <form
        className="shrink-0 border-t border-[var(--hairline)] bg-[var(--panel)] p-3"
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
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-ink-raised px-3 text-[12.5px] outline-none placeholder:text-muted focus:border-violet/60"
        />
      </form>
    </aside>
  );
}

function QBody() {
  const s = useStudio();
  const status = s.qStatus;

  if (status === "loading") {
    return <p className="text-[12.5px] font-semibold leading-[18px]">Q is listening for nearby records…</p>;
  }

  if (status === "failure") {
    return (
      <div>
        <p className="text-[12.5px] font-semibold leading-[18px]">Q couldn’t finish that search.</p>
        <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
          Your library and crate are unchanged. Try again, or narrow by BPM, key, or mood.
        </p>
        <button
          type="button"
          className="mt-4 h-8 rounded-full border border-line px-3 text-[11.5px] hover:border-amber/40"
          onClick={() => s.askQ(s.qPrompt || "Find nearby records")}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "no-results") {
    if (!s.analysisReady) {
      return (
        <div>
          <p className="text-[13px] font-semibold leading-[19px]">Analyze this library to unlock Q.</p>
          <p className="mt-2 text-[12.5px] leading-[19px] text-paper-dim">
            Playback works now. Sonic neighbors, match reasons, clusters, and crate suggestions need a
            completed local analysis run.
          </p>
          <a
            href="/analysis"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-amber px-4 text-[12px] font-semibold text-[var(--text-on-accent-dark)]"
          >
            Start local analysis
          </a>
        </div>
      );
    }
    return (
      <div>
        <p className="text-[12.5px] font-semibold leading-[18px]">Q didn’t find a confident match.</p>
        <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
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
        <p className="text-[12.5px] font-semibold leading-[18px]">
          These {s.selectedIds.length} records share a dry, clipped kick and minor-key pressure.
        </p>
        <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
          Six form a peak-time run; three lean tougher and may work better afterhours.
        </p>
        <CardList />
      </div>
    );
  }

  if (status === "crate" && s.activeCrate) {
    return (
      <div>
        <p className="text-[12.5px] font-semibold leading-[18px]">Two gaps and one ending problem.</p>
        <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
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
        <p className="text-[12.5px] font-semibold leading-[18px]">
          Q found {s.qCards.length || s.candidates.length} nearby records.
        </p>
        <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
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
      <p className="text-[12.5px] font-semibold leading-[18px]">Where are we digging tonight?</p>
      <p className="mt-2 text-[12px] leading-[19px] text-paper-dim">
        Select a record, choose a nearby group, or describe the moment. Q will return records and actions, not
        a chat thread.
      </p>
      <ul className="mt-5 flex flex-col gap-2">
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
              className="w-full rounded-lg border border-line px-3 py-2.5 text-left text-[12px] leading-[18px] text-paper-dim hover:border-amber/35 hover:text-paper"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[11px] leading-4 text-muted">
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
    <ul className="mt-4 flex flex-col gap-2">
      {cards.map((card) => (
        <li key={card.trackId} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--raised)] px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-paper">{card.title}</p>
          <p className="mt-0.5 text-[11px] text-paper-dim">{card.artist}</p>
          <p className="mt-1 tabular text-[11px] text-muted">
            {formatScore(card.score)} match · {formatBpm(card.bpm)} BPM · {formatKey(card.key)} ·{" "}
            {card.blend === "safer" ? "safer blend" : "pivot"}
          </p>
          <p className="mt-2 text-[11.5px] leading-[17px] text-paper-dim">{card.reason}</p>
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
      className="h-8 rounded-full border border-line px-3 text-[11.5px] text-paper hover:border-amber/40"
    >
      {children}
    </button>
  );
}
