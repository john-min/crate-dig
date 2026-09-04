"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StudioTrack } from "@/lib/studio/types";
import { IconPersimmon, IconPlus } from "./icons";
import { useStudio } from "./StudioProvider";

export function CrateAddButton({
  track,
  menuPlacement = "below",
}: {
  track: StudioTrack;
  menuPlacement?: "above" | "below";
}) {
  const s = useStudio();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const inCrates = s.crates.filter((crate) => crate.trackIds.includes(track.id));
  const favorited = inCrates.length > 0;

  const close = () => {
    setOpen(false);
    setCreating(false);
    setName("");
  };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    const width = menu?.width ?? 220;
    const height = menu?.height ?? 240;
    let left = button.left;
    let top = menuPlacement === "above" ? button.top - height - 6 : button.bottom + 6;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    if (top + height > window.innerHeight - 8) top = Math.max(8, button.top - height - 6);
    if (top < 8) top = Math.min(window.innerHeight - height - 8, button.bottom + 6);
    setPos({ top, left });
  }, [open, creating, s.crates.length, favorited, menuPlacement]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const createNamed = () => {
    const trimmed = name.trim();
    s.createCrate({
      name: trimmed || undefined,
      trackId: track.id,
      open: false,
    });
    setCreating(false);
    setName("");
  };

  return (
    <div className="shrink-0" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          favorited
            ? `${track.title} is in ${inCrates.length === 1 ? inCrates[0].name : `${inCrates.length} crates`}. Manage crates`
            : `Add ${track.title} to a crate`
        }
        className={
          favorited
            ? "grid h-[22px] w-[22px] place-items-center rounded-[5px] bg-transparent"
            : "grid h-[22px] w-[22px] place-items-center rounded-full border border-[#8B929F] bg-transparent text-[#C4CAD4]"
        }
        onClick={() => {
          setOpen((value) => !value);
          setCreating(false);
        }}
      >
        {favorited ? <IconPersimmon className="h-[22px] w-[22px]" /> : <IconPlus className="h-2.5 w-2.5" />}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Crates for ${track.title}`}
              className="fixed z-[80] w-[13.5rem] overflow-hidden rounded-[10px] border border-[#262B34] bg-[#12151B] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
              style={{ top: pos.top, left: pos.left }}
            >
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6B7383]">
                Add to crate
              </p>
              {s.crates.map((crate) => {
                const on = crate.trackIds.includes(track.id);
                return (
                  <button
                    key={crate.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-[#181C24]"
                    onClick={() => s.toggleTrackInCrate(track.id, crate.id)}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
                      style={{ background: s.crateColor(crate.id) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#EDEFF3]">{crate.name}</span>
                    {on ? <span className="text-[11px] text-[#A9C64A]">✓</span> : null}
                  </button>
                );
              })}
              <div className="my-1 h-px bg-[#1B1F27]" />
              {creating ? (
                <form
                  className="flex items-center gap-1.5 px-2.5 py-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createNamed();
                  }}
                >
                  <input
                    ref={inputRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={`Crate ${s.crates.length + 1}`}
                    className="min-w-0 flex-1 rounded-[6px] border border-[#2A2F39] bg-[#0D0F13] px-2 py-1 text-[12px] text-[#EDEFF3] outline-none placeholder:text-[#5B6373]"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-[6px] bg-[#EDEFF3] px-2 py-1 text-[11px] font-medium text-[#0D0F13]"
                  >
                    Add
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-[7px] text-left text-[12.5px] text-[#C4CAD4] hover:bg-[#181C24]"
                  onClick={() => setCreating(true)}
                >
                  <IconPlus className="h-3 w-3 text-[#98A0AE]" />
                  New crate
                </button>
              )}
              {favorited ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-[7px] text-left text-[12.5px] text-[#E4705A] hover:bg-[#181C24]"
                  onClick={() => {
                    s.removeTrackFromAllCrates(track.id);
                    close();
                  }}
                >
                  Remove from crates
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
