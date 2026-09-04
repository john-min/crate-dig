"use client";

import { useStudio } from "./StudioProvider";
import { TrackRow } from "./TrackRow";

/** Keyboard/list alternative when the map cannot render. */
export function MapFallbackList() {
  const s = useStudio();
  const groups = new Map<string, typeof s.visible>();
  for (const track of s.visible.slice(0, 400)) {
    const list = groups.get(track.clusterName) ?? [];
    list.push(track);
    groups.set(track.clusterName, list);
  }

  return (
    <div className="h-full min-h-0 overflow-auto px-4 py-4">
      <h2 className="font-serif text-[1.5rem] tracking-tight">Records without the map</h2>
      <p className="mt-2 max-w-[60ch] text-[14px] leading-6 text-paper-dim">
        {s.webglOk
          ? "List view of the current filters. Use this when you want rows instead of points."
          : "WebGL is unavailable, so the map cannot draw. This list is the discovery equivalent: clusters, then tracks."}
      </p>
      {[...groups.entries()].map(([name, tracks]) => (
        <section key={name} className="mt-6">
          <h3 className="text-[14px] font-medium">
            {name}
            <span className="ml-2 tabular text-[12px] font-normal text-muted">{tracks.length}</span>
          </h3>
          <div className="mt-2 divide-y divide-line/80">
            {tracks.slice(0, 12).map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                density="compact"
                selected={s.selectedIds.includes(track.id)}
                playing={s.playing?.id === track.id && s.playStatus === "playing"}
                score={s.scoreFor(track)}
                onSelect={() => s.selectTrack(track.id)}
                onPlay={() => s.play(track.id)}
                onOpen={() => s.openDrawer(track.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
