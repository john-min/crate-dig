export function PlayerBar() {
  return (
    <div className="flex h-14 items-center gap-4 border-t border-line bg-ink-raised px-4">
      <button
        type="button"
        aria-label="Play"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-paper hover:border-amber/50"
      >
        <span className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-paper" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-paper">No track selected</p>
        <p className="truncate text-[12px] text-muted">Audition from the map or list</p>
      </div>
      <div className="hidden min-w-[12rem] flex-1 items-center gap-3 sm:flex">
        <span className="tabular-nums text-[11px] text-muted">0:00</span>
        <div className="h-px flex-1 bg-line">
          <div className="h-px w-0 bg-amber" />
        </div>
        <span className="tabular-nums text-[11px] text-muted">0:00</span>
      </div>
    </div>
  );
}
