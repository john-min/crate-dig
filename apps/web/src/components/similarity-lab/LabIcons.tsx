type IconProps = { className?: string };

export function PlayIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="currentColor" d="M4.1 2.4v11.2L13.5 8 4.1 2.4Z" /></svg>;
}

export function PauseIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="currentColor" d="M3.4 2.5h3.2v11H3.4zm6 0h3.2v11H9.4z" /></svg>;
}

export function CheckIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="m3 8.2 3.1 3.1L13 4.8" /></svg>;
}

export function CloseIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" d="m4 4 8 8m0-8-8 8" /></svg>;
}

export function SkipIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" d="m3.2 3.5 5.5 4.5-5.5 4.5v-9Zm6.2 0 3.4 2.8v3.4l-3.4 2.8v-9Z" /></svg>;
}

export function RefreshIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" d="M13 5.5V2.8l-1.2 1.1A5.5 5.5 0 1 0 13.3 10M13 2.8H9.9" /></svg>;
}
