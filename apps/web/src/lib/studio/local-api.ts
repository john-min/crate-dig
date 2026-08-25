export const LOCAL_API_URL = (
  process.env.NEXT_PUBLIC_LOCAL_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type DiskTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration_sec: number | null;
  location: string;
  location_kind: string;
  missing: boolean;
  preview_url: string | null;
};

export async function localApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_API_URL}/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export async function fetchDiskTracks(): Promise<DiskTrack[]> {
  const res = await fetch(`${LOCAL_API_URL}/tracks`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load local tracks");
  const body = (await res.json()) as { tracks: DiskTrack[] };
  return body.tracks ?? [];
}

export async function importFolder(folderPath: string, libraryName = "Local Music") {
  const res = await fetch(`${LOCAL_API_URL}/imports/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_path: folderPath, library_name: libraryName }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "Import failed");
  }
  return res.json() as Promise<{ library_id: string; scanned: number; tracks: number }>;
}
