import Link from "next/link";

export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" }) {
  const mark = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const type = size === "sm" ? "text-[13px]" : "text-[14px]";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 text-paper no-underline"
    >
      <span
        aria-hidden
        className={`${mark} rounded-full border border-amber/80 shadow-[inset_0_0_0_3px_var(--ink),inset_0_0_0_4.5px_oklch(0.79_0.11_78/0.9)]`}
      />
      <span className={`${type} font-semibold tracking-[0.01em]`}>Crate Dig</span>
    </Link>
  );
}
