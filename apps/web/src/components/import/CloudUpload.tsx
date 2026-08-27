"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CloudRuntimeAdapter } from "@crate-dig/contracts";
import { hasCloudUpload } from "@crate-dig/contracts";
import { isAllowedAudioType } from "@/lib/cloud/audio";
import { normalizeAdapterError } from "@/lib/adapters/errors";

const ACCEPT = ".mp3,.mp4,.m4a,.wav,.aiff,.aif,.flac,.aac,.ogg";

type FileStatus = "pending" | "uploading" | "registering" | "ok" | "error";

type FileRow = {
  id: string;
  file: File;
  status: FileStatus;
  message: string;
};

export function CloudUpload({ adapter }: { adapter: CloudRuntimeAdapter }) {
  const router = useRouter();
  const [rows, setRows] = useState<FileRow[]>([]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  function takeFiles(list: FileList | null) {
    if (!list) return;
    setRows(
      Array.from(list).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        status: "pending",
        message: "",
      })),
    );
  }

  async function uploadAll() {
    if (!hasCloudUpload(adapter) || busy) return;
    setBusy(true);
    const libraries = await adapter.listLibraries().catch(() => []);
    const libraryId = libraries[0]?.id ?? "default";

    for (const row of rows) {
      if (!isAllowedAudioType(row.file.type || "audio/octet-stream") && row.file.type) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, status: "error", message: "Unsupported file type." }
              : item,
          ),
        );
        continue;
      }
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, status: "uploading", message: "Requesting signed URL…" } : item,
        ),
      );
      try {
        const session = await adapter.createSignedUpload({
          libraryId,
          fileName: row.file.name,
          contentType: row.file.type || "application/octet-stream",
          sizeBytes: row.file.size,
        });
        const put = await fetch(session.url, {
          method: session.method,
          headers: { ...session.headers },
          body: row.file,
        });
        if (!put.ok) {
          throw new Error(`Direct R2 upload failed with status ${put.status}.`);
        }
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, status: "registering", message: "Registering object…" }
              : item,
          ),
        );
        await adapter.completeCloudUpload({
          uploadId: session.uploadId,
          objectKey: session.objectKey,
          etag: put.headers.get("etag") ?? undefined,
        });
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: "ok", message: "Stored privately." } : item,
          ),
        );
      } catch (error) {
        const normalized = normalizeAdapterError(error);
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, status: "error", message: normalized.message }
              : item,
          ),
        );
      }
    }
    setBusy(false);
    if (rows.length > 0) router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-[var(--panel)] p-5">
      <p className="text-[12px] uppercase tracking-[0.16em] text-muted">Hosted upload</p>
      <h2 className="mt-2 font-serif text-[1.5rem] leading-tight">Private R2 transfer</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
        Audio leaves this device only after you choose files. Bytes go directly to private object
        storage with a short-lived signed URL. This app never proxies the file body.
      </p>
      <label
        onDragEnter={(event) => {
          event.preventDefault();
          setActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setActive(false);
          takeFiles(event.dataTransfer.files);
        }}
        className={`mt-4 flex min-h-[12rem] cursor-pointer flex-col items-start justify-end rounded-2xl border border-dashed px-6 py-6 transition-colors ${
          active ? "border-amber/60 bg-ink-raised" : "border-line bg-ink-raised/40"
        }`}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => takeFiles(event.target.files)}
        />
        <p className="font-serif text-[1.35rem] leading-tight text-paper">Drop audio files</p>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
          MP3, M4A/MP4, WAV, FLAC, AAC, AIFF, OGG. Folder import is not available in cloud mode.
        </p>
      </label>
      {rows.length > 0 ? (
        <ul className="mt-5 max-h-48 overflow-auto text-[13px]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 py-1">
              <span className="truncate text-paper-dim">{row.file.name}</span>
              <span className={row.status === "error" ? "text-coral" : "text-muted"}>
                {row.status === "pending" ? "Ready" : row.message || row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        disabled={busy || rows.length === 0}
        onClick={() => void uploadAll()}
        className="mt-4 h-10 rounded-full bg-amber px-5 text-[13px] font-medium text-[var(--text-on-accent-dark)] disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload to private storage"}
      </button>
    </div>
  );
}
