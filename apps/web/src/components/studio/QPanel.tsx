"use client";

import { formatBpm, formatKey } from "@/lib/studio/format";
import { MOOD_COLORS } from "@/lib/studio/constants";
import { useStudio } from "./StudioProvider";

const PROMPTS = [
  "Find me warm, percussive tracks around 122 BPM.",
  "What sounds similar to this but darker?",
  "Raise energy after this track.",
];

export function QPanel({ overlay = false }: { overlay?: boolean }) {
  const s = useStudio();
  if (s.sidecar !== "q") return null;

  return (
    <aside
      role="complementary"
      aria-label="Q assistant"
      className={`flex h-full min-h-0 flex-col bg-[#0D0F13] ${
        overlay
          ? "absolute inset-y-0 right-0 z-30 w-[min(var(--q-panel-width),100%)] border-l border-[#1B1F27] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          : "border-l border-[#1B1F27]"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[#171B21] px-3.5">
        <span className="grid h-[19px] w-[19px] place-items-center rounded-[6px] border border-[#3A3350] bg-[#181430] text-[10.5px] font-semibold text-[#8B7BF0]">
          Q
        </span>
        <span className="text-[13px] font-semibold">Q</span>
        <button
          type="button"
          className="ml-auto bg-transparent text-[14px] text-[#7C8698]"
          aria-label="Close"
          onClick={() => {
            s.closeSidecar();
            s.setMobileView("map");
          }}
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5" role="status" aria-live="polite">
        <QBody />
      </div>
      <div className="shrink-0 border-t border-[#171B21] px-3 py-[11px]">
        <label className="flex h-[38px] items-center rounded-[9px] border border-[#2A2F39] bg-[#0F1116] px-3">
          <span className="sr-only">Ask Q</span>
          <input
            value={s.qPrompt}
            onChange={(event) => s.setQPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                s.askQ();
              }
            }}
            placeholder="Ask Q to find, explain, or shape a crate…"
            className="flex-1 bg-transparent text-[12.5px] text-[#EDEFF3] outline-none placeholder:text-[#8B929F]"
          />
        </label>
      </div>
    </aside>
  );
}

function QBody() {
  const s = useStudio();
  const status = s.qStatus;

  if (status === "listening") {
    return (
      <div className="flex items-center gap-2.5 text-[12.5px] text-[#B7BEC9]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8B7BF0]" style={{ animation: "breath 1.4s infinite" }} />
        Q is listening for nearby records…
      </div>
    );
  }

  if (status === "failure") {
    return (
      <div className="rounded-[11px] border border-[#3A2E23] bg-[#151009] p-3.5">
        <p className="text-[13px] font-semibold text-[#F0B896]">Q couldn’t finish that search</p>
        <p className="mt-[7px] text-[12px] leading-[1.55] text-[#B39A85]">
          Your library and crate are unchanged. Try again, or loosen BPM, keys, or mood.
        </p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-[11px] border border-[#3A2E23] bg-[#151009] p-3.5">
        <p className="text-[13px] font-semibold text-[#F0B896]">Q didn&apos;t find a confident match</p>
        <p className="mt-[7px] text-[12px] leading-[1.55] text-[#B39A85]">
          Try loosening BPM, including adjacent keys, or removing the mood filter.
        </p>
        <div className="mt-[11px] flex flex-wrap gap-[7px]">
          <button
            type="button"
            className="rounded-[7px] border border-[#4A3524] bg-[#2A1E14] px-[11px] py-1.5 text-[11.5px] text-[#F0B896]"
            onClick={() => s.setFilters({ ...s.filters, bpmNearSeed: false, bpmMin: s.bpmBounds.min, bpmMax: s.bpmBounds.max })}
          >
            Loosen BPM
          </button>
          <button
            type="button"
            className="rounded-[7px] border border-[#4A3524] bg-transparent px-[11px] py-1.5 text-[11.5px] text-[#D6A788]"
            onClick={() => {
              s.clearFilters();
              s.setSeed(null);
            }}
          >
            Search whole library
          </button>
        </div>
      </div>
    );
  }

  if (status === "found") {
    return (
      <div>
        <p className="mb-1 text-[11px] text-[#6B7383]">
          listening → found {s.qCards.length} records → applied to view
        </p>
        <p className="mb-3 text-[13px] leading-[1.6] text-[#B7BEC9]">“{s.qAsk}”</p>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {s.qEvidence.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[#2E2648] bg-[#171226] px-2.5 py-1 text-[11px] text-[#C4B6F5]"
            >
              {chip}
            </span>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-[#262B34] bg-[#0F1116]">
          {s.qCards.map((card) => {
            const track = s.tracks.find((item) => item.id === card.trackId);
            const color = card.color ?? MOOD_COLORS[track?.mood ?? ""] ?? "#8B7BF0";
            return (
              <div key={card.trackId} className="border-b border-[#14171C] px-[13px] py-[11px] last:border-b-0">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    aria-label={`Play ${card.title}`}
                    className="grid h-[26px] w-[26px] place-items-center rounded-[6px] text-[8px]"
                    style={{
                      background: `${color}1F`,
                      border: `1px solid ${color}44`,
                      color,
                    }}
                    onClick={() => s.play(card.trackId)}
                  >
                    ▶
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px]">{card.title}</div>
                    <div className="mt-0.5 text-[11px] text-[#8B929F]">
                      {card.artist} · {formatBpm(card.bpm)} · {formatKey(card.key)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-3 pl-[35px]">
                  <button
                    type="button"
                    className="bg-transparent p-0 text-[11px] text-[#E9A63C]"
                    onClick={() => s.addToCrate(card.trackId)}
                  >
                    + Crate
                  </button>
                  <button
                    type="button"
                    className="bg-transparent p-0 text-[11px] text-[#98A0AE]"
                    onClick={() => s.selectTrack(card.trackId)}
                  >
                    Show on map
                  </button>
                  <button
                    type="button"
                    className="bg-transparent p-0 text-[11px] text-[#98A0AE]"
                    onClick={() => s.setSeed(card.trackId)}
                  >
                    Use as seed
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-[11px] border border-[#1F232B] bg-[#0B0D11] p-3.5">
        <p className="text-[13px] font-semibold">Find the next record</p>
        <p className="mt-[7px] text-[12.5px] leading-[1.6] text-[#98A0AE]">
          Describe a vibe, a constraint, or where the set should go next. Q returns records and actions — not a
          chat thread.
        </p>
      </div>
      <p className="mb-[9px] mt-4 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#7C8698]">
        Try asking
      </p>
      <div className="grid gap-[7px]">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="w-full rounded-[9px] border border-[#1F232B] bg-[#0B0D11] px-3 py-2.5 text-left text-[12.5px] leading-[1.4] text-[#B7BEC9]"
            onClick={() => s.askQ(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
