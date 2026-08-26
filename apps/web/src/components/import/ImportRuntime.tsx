"use client";

import { LocalFolderImport } from "./LocalFolderImport";
import { CloudUpload } from "./CloudUpload";
import { createWebRuntime, resolveWebAppMode } from "@/lib/adapters/runtime";
import { hasCloudUpload, hasLocalImport } from "@crate-dig/contracts";

export function ImportRuntime() {
  const mode = resolveWebAppMode(process.env.NEXT_PUBLIC_APP_MODE);
  const runtime = createWebRuntime(mode, {
    localApiUrl: process.env.NEXT_PUBLIC_LOCAL_API_URL,
    cloudApiUrl: process.env.NEXT_PUBLIC_CLOUD_API_URL,
  });

  if (hasCloudUpload(runtime.adapter)) {
    return <CloudUpload adapter={runtime.adapter} />;
  }

  if (hasLocalImport(runtime.adapter)) {
    return <LocalFolderImport importer={runtime.adapter} />;
  }

  return (
    <p className="rounded-[var(--radius-lg)] border border-line bg-[var(--panel)] p-5 text-sm text-muted">
      No import surface is available for this runtime.
    </p>
  );
}
