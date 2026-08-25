"use client";

import { useEffect, useState } from "react";
import type { Breakpoint } from "@/lib/studio/types";

function fromWidth(w: number): Breakpoint {
  if (w < 640) return "mobile";
  if (w < 900) return "small";
  if (w < 1180) return "tablet";
  if (w < 1440) return "laptop";
  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>("desktop");
  useEffect(() => {
    const update = () => setBp(fromWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return bp;
}

export function isWide(bp: Breakpoint): boolean {
  return bp === "desktop";
}

export function docksQ(bp: Breakpoint): boolean {
  return bp === "desktop";
}

export function usesFilterSheet(bp: Breakpoint): boolean {
  return bp === "mobile" || bp === "small" || bp === "tablet";
}

export function usesSegmentedViews(bp: Breakpoint): boolean {
  return bp === "mobile" || bp === "small";
}
