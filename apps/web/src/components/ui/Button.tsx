import type { ButtonHTMLAttributes, ReactNode } from "react";

const variants = {
  primary:
    "bg-amber text-ink hover:bg-amber/90 disabled:bg-amber/40 disabled:text-ink/50",
  ghost:
    "border border-line bg-transparent text-paper hover:bg-ink-hover disabled:opacity-40",
  subtle: "bg-ink-raised text-paper hover:bg-ink-hover disabled:opacity-40",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  className = "",
  type = "submit",
  children,
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-[15px] font-medium tracking-tight transition-colors ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
