export const LOCAL_API_URL = (
  process.env.NEXT_PUBLIC_LOCAL_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type DiskTrack = {
  id: string;
  library_id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  label: string;
  bpm: number | null;
  key: string | null;
  bpm_source: string | null;
  key_source: string | null;
  duration_sec: number | null;
  location: string;
  location_kind: string;
  missing: boolean;
  created_at: string;
  preview_url: string | null;
};

export type LocalLibrary = {
  id: string;
  name: string;
  source: string;
  created_at: string;
  updated_at: string;
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

export async function fetchDiskLibrary(): Promise<{
  library: LocalLibrary;
  tracks: DiskTrack[];
} | null> {
  const librariesRes = await fetch(`${LOCAL_API_URL}/libraries`, { cache: "no-store" });
  if (!librariesRes.ok) throw new Error("Could not load local libraries");
  const librariesBody = (await librariesRes.json()) as { libraries: LocalLibrary[] };
  const libraries = librariesBody.libraries ?? [];
  if (!libraries.length) return null;

  const configuredId = process.env.NEXT_PUBLIC_LOCAL_LIBRARY_ID;
  const library =
    libraries.find((item) => item.id === configuredId) ??
    [...libraries].reverse().find((item) => /jeff usb/i.test(item.name)) ??
    [...libraries].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const res = await fetch(`${LOCAL_API_URL}/libraries/${library.id}/tracks`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not load local tracks");
  const body = (await res.json()) as { tracks: DiskTrack[] };
  return { library, tracks: body.tracks ?? [] };
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
