"use client";

import { formatBpm, formatKey } from "@/lib/studio/format";
import { useStudio } from "./StudioProvider";

export function CratePanel({ overlay = false }: { overlay?: boolean }) {
  const s = useStudio();
  const crate = s.activeCrate;

  if (s.sidecar !== "crate" || !crate) return null;

  const rows = crate.trackIds
    .map((id) => s.tracks.find((track) => track.id === id))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
  const moment = crate.intention || [crate.timeOfDay, crate.room].filter(Boolean).join(" · ");

  return (
    <aside
      role="complementary"
      aria-label="Crate"
      className={`flex h-full min-h-0 flex-col bg-[#0D0F13] ${
        overlay
          ? "absolute inset-y-0 right-0 z-30 w-[min(var(--q-panel-width),100%)] border-l border-[#1B1F27] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          : "border-l border-[#1B1F27]"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[#171B21] px-3.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
          style={{ background: s.crateColor(crate.id) }}
        />
        <span className="text-[13px] font-semibold">{crate.name}</span>
        <span className="text-[11.5px] text-[#7C8698]">{crate.trackIds.length} tracks</span>
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
      <div className="shrink-0 border-b border-[#171B21] px-3.5 py-2.5">
        <p className="text-[11px] text-[#6B7383]">Set moment</p>
        <p className="mt-[3px] text-[12.5px] text-[#B7BEC9]">{moment || "—"}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="m-4 rounded-[11px] border border-dashed border-[#2A2F39] px-[22px] py-[22px] text-center">
            <p className="text-[12.5px] leading-[1.6] text-[#98A0AE]">
              Empty crate. Use the persimmon next to a track title to add records here.
            </p>
          </div>
        ) : (
          <div className="grid gap-px bg-[#171B21]">
            {rows.map((track, index) => {
              const playing = s.playing?.id === track.id;
              return (
                <div
                  key={track.id}
                  className="grid grid-cols-[20px_minmax(0,1fr)_50px_34px_44px] items-center gap-2.5 px-3.5 py-2.5"
                  style={{ background: playing ? "#111318" : "#0D0F13" }}
                >
                  <span className="text-[11px] text-[#5B6373]">{String(index + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    className="min-w-0 bg-transparent p-0 text-left"
                    onClick={() => s.play(track.id)}
                  >
                    <div
                      className="truncate text-[12.5px]"
                      style={{ color: playing ? "#E9A63C" : "#EDEFF3" }}
                    >
                      {track.title}
                    </div>
                    <div className="truncate text-[11px] text-[#7C8698]">{track.artist}</div>
                  </button>
                  <span
                    className="text-[11.5px]"
                    style={{ color: track.bpm != null ? "#A6ACB8" : "#5B6373" }}
                  >
                    {formatBpm(track.bpm)}
                  </span>
                  <span className="text-[11.5px] text-[#8B7BF0]">{formatKey(track.key)}</span>
                  <button
                    type="button"
                    className="bg-transparent text-[12px] text-[#5B6373]"
                    aria-label={`Remove ${track.title}`}
                    onClick={() => s.removeFromCrate(track.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-[#171B21] px-3.5 py-3 text-[11.5px] text-[#6B7383]">
        Adding tracks now goes to <strong className="font-semibold text-[#EDEFF3]">{crate.name}</strong>.
      </div>
    </aside>
  );
}
