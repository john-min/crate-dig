"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importFolder, localApiHealth } from "@/lib/studio/local-api";

export function LocalFolderImport() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "offline" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const folder = path.trim();
    if (!folder) return;
    setStatus("working");
    setMessage("");
    const up = await localApiHealth();
    if (!up) {
      setStatus("offline");
      setMessage("Local API is not running. Start it with: cd apps/local-api && uvicorn cratedig_local_api.app:create_app --factory --host 127.0.0.1 --port 8000");
      return;
    }
    try {
      const result = await importFolder(folder);
      setStatus("ok");
      setMessage(`Indexed ${result.scanned} files from disk. Playback uses those paths.`);
      router.push("/map");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[var(--radius-lg)] border border-line bg-[var(--panel)] p-5">
      <p className="text-[12px] uppercase tracking-[0.16em] text-muted">Play from disk</p>
      <h2 className="mt-2 font-serif text-[1.5rem] leading-tight">Local folder</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
        Index MP3, M4A/MP4, WAV, FLAC, AAC, OGG, and AIFF in place. Crate Dig stores the path, not a
        copy. The browser plays through localhost Range streaming.
      </p>
      <label className="mt-4 block text-[13px] text-paper-dim" htmlFor="local-folder">
        Absolute folder path
      </label>
      <input
        id="local-folder"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="/Users/you/Music"
        className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line bg-[var(--control)] px-3 text-[14px] outline-none placeholder:text-muted focus:border-amber/40"
      />
      <button
        type="submit"
        disabled={status === "working" || !path.trim()}
        className="mt-4 h-10 rounded-full bg-amber px-5 text-[13px] font-medium text-[var(--text-on-accent-dark)] disabled:opacity-50"
      >
        {status === "working" ? "Scanning…" : "Index folder"}
      </button>
      {message ? (
        <p className={`mt-3 text-[13px] ${status === "ok" ? "text-lime" : "text-coral"}`}>{message}</p>
      ) : null}
    </form>
  );
}
