export function IconSkipBack({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M4.2 5.5h1.7v13H4.2zm9.3 0v13L7.1 12zm7.35 0v13L14.5 12z" />
    </svg>
  );
}

export function IconSkipForward({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M18.1 5.5h1.7v13h-1.7zM3.15 5.5v13L9.55 12zm7.35 0v13L16.9 12z" />
    </svg>
  );
}

export function IconPlay({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path fill="currentColor" d="M4.2 2.4v11.2L13.6 8 4.2 2.4Z" />
    </svg>
  );
}

export function IconPause({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path fill="currentColor" d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" />
    </svg>
  );
}

export function IconClose({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M4 4l8 8M12 4l-8 8"
      />
    </svg>
  );
}

export function IconPlus({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M8 3.5v9M3.5 8h9"
      />
    </svg>
  );
}

export function IconOverflow({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="3.5" r="1.15" fill="currentColor" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1.15" fill="currentColor" />
    </svg>
  );
}
