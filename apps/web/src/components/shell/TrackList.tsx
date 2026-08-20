const PLACEHOLDER_TRACKS = [
  { title: "Amber Corridor", artist: "Lumen Room", bpm: 122, key: "8A", vibe: "warm" },
  { title: "Low Ceiling", artist: "Nite Fold", bpm: 124, key: "9A", vibe: "dark" },
  { title: "Coastal Delay", artist: "Mira Glass", bpm: 118, key: "7B", vibe: "dreamy" },
  { title: "Second Room", artist: "Paloma", bpm: 126, key: "11A", vibe: "peak" },
  { title: "After the Lights", artist: "Kite & Wire", bpm: 120, key: "4A", vibe: "hypnotic" },
];

export function TrackList() {
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line bg-ink">
      <div className="flex h-8 items-center justify-between px-4 text-[11px] uppercase tracking-[0.16em] text-muted">
        <span>Tracks</span>
        <span>Placeholder</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-4 py-1 font-normal">Title</th>
              <th className="px-4 py-1 font-normal">Artist</th>
              <th className="px-4 py-1 font-normal">BPM</th>
              <th className="px-4 py-1 font-normal">Key</th>
              <th className="px-4 py-1 font-normal">Vibe</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_TRACKS.map((track) => (
              <tr key={track.title} className="border-t border-line/80 hover:bg-ink-hover">
                <td className="px-4 py-2 text-paper">{track.title}</td>
                <td className="px-4 py-2 text-paper-dim">{track.artist}</td>
                <td className="px-4 py-2 tabular-nums text-paper-dim">{track.bpm}</td>
                <td className="px-4 py-2 tabular-nums text-paper-dim">{track.key}</td>
                <td className="px-4 py-2 text-muted">{track.vibe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
