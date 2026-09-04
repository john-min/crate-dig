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

export function IconPersimmon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="1.8 2 12.4 12.6" aria-hidden>
      <path
        fill="#FF7A12"
        d="M2.1 9.2C2.18 6.4 4.7 4.8 8 4.8c3.32 0 5.82 1.55 5.9 4.35.1 2.85-2.45 5.2-5.9 5.2S2 12.05 2.1 9.2Z"
      />
      <path
        fill="#1A120E"
        d="M8 2.15c.28-.1.58.08.68.38.1.28.02.55-.14.75.52-.2 1.18 0 1.38.55.2.52-.08 1-.52 1.2.46.1.82.5.88 1 .08.52-.32.98-.82 1.08-.22.04-.45 0-.65-.12.12.35 0 .78-.38.95-.4.2-.85-.02-.98-.4-.12.35-.5.55-.88.4-.4-.16-.55-.6-.35-.95-.22.12-.48.18-.75.1-.5-.15-.75-.62-.55-1.08.16-.42.55-.7 1-.75-.4-.2-.68-.65-.5-1.12.16-.48.68-.72 1.12-.5.08-.28.2-.52.48-.64Z"
      />
      <circle cx="11.4" cy="3.15" r="0.55" fill="#1A120E" />
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
