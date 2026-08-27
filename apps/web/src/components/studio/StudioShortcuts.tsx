"use client";

import { useEffect } from "react";
import { useStudio } from "./StudioProvider";

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function StudioShortcuts() {
  const s = useStudio();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (
        (event.key === "/" && !typingInField(event.target)) ||
        (meta && event.key.toLowerCase() === "f") ||
        (meta && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        document.getElementById("studio-search")?.focus();
        return;
      }
      if (event.key === "Escape") {
        if (s.qOpen) {
          s.closeQ();
          return;
        }
        if (s.drawerOpen) {
          s.closeDrawer();
          return;
        }
        if (s.howToReadOpen) {
          s.setHowToReadOpen(false);
          return;
        }
        s.selectTrack(null);
        return;
      }
      if (typingInField(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        s.togglePlay();
        return;
      }
      if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        s.toggleQ();
        return;
      }
      if (event.key.toLowerCase() === "a" && (s.focusedId || s.primarySelected)) {
        event.preventDefault();
        s.addToCrate(s.focusedId ?? s.primarySelected!.id);
        return;
      }
      if (event.key === "Enter" && (s.focusedId || s.primarySelected)) {
        event.preventDefault();
        s.openDrawer(s.focusedId ?? s.primarySelected!.id);
        return;
      }
      if (
        event.key === "j" ||
        event.key === "ArrowDown" ||
        event.key === "k" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        const list = s.candidates;
        if (!list.length) return;
        const current = s.focusedId ?? s.selectedIds[0];
        const idx = Math.max(0, list.findIndex((t) => t.id === current));
        const dir = event.key === "j" || event.key === "ArrowDown" ? 1 : -1;
        const next = list[Math.min(list.length - 1, Math.max(0, idx + dir))];
        if (!next) return;
        s.focusTrack(next.id);
        s.selectTrack(next.id, { range: event.shiftKey });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  return null;
}
