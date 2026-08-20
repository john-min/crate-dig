"use client";

import { useState } from "react";

const ACCEPT = [".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a", ".xml"];

export function UploadDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [active, setActive] = useState(false);

  function takeFiles(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
  }

  return (
    <div>
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
        className={`flex min-h-[18rem] cursor-pointer flex-col items-start justify-end rounded-2xl border border-dashed px-8 py-8 transition-colors ${
          active ? "border-amber/60 bg-ink-raised" : "border-line bg-ink-raised/40"
        }`}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="sr-only"
          onChange={(event) => takeFiles(event.target.files)}
        />
        <p className="font-serif text-[1.75rem] leading-tight text-paper">
          Drop a folder, files, or Rekordbox XML
        </p>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted">
          MP3, WAV, AIFF, FLAC, M4A. Rekordbox XML import lands in a later pass.
          Audio goes to private storage with signed URLs — not through the web
          app.
        </p>
      </label>

      {files.length > 0 ? (
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Library scan
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-[14px] sm:grid-cols-4">
            <Stat label="Detected" value={String(files.length)} />
            <Stat label="Duplicates" value="0" />
            <Stat label="Unsupported" value="0" />
            <Stat label="Missing metadata" value="—" />
          </dl>
          <ul className="mt-6 max-h-40 overflow-auto text-[13px] text-paper-dim">
            {files.slice(0, 12).map((file) => (
              <li key={`${file.name}-${file.size}`} className="truncate py-1">
                {file.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl text-paper">{value}</dd>
    </div>
  );
}
