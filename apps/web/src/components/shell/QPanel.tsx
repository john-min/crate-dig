const PROMPTS = [
  "Find warmer tracks around 122 BPM",
  "What sounds similar but darker?",
  "Build a 45-minute sunset lounge crate",
];

export function QPanel() {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-ink">
      <div className="flex h-12 items-center justify-between px-4">
        <p className="text-[13px] font-medium tracking-wide">Q</p>
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted">Assistant</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="font-serif text-[1.35rem] leading-snug text-paper">
          Select a record, then ask Q.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Q understands the current selection, filters, crate, and playback. It
          returns next moves, not chatbot filler.
        </p>
        <ul className="mt-8 flex flex-col gap-2">
          {PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-left text-[13px] leading-snug text-paper-dim hover:border-amber/35 hover:text-paper"
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form className="border-t border-line p-3">
        <label className="sr-only" htmlFor="q-ask">
          Ask Q
        </label>
        <input
          id="q-ask"
          placeholder="Ask Q…"
          className="h-10 w-full rounded-md border border-line bg-ink-raised px-3 text-[13px] outline-none placeholder:text-muted focus:border-amber/40"
        />
      </form>
    </aside>
  );
}
