export type AudioObjectRef = {
  kind: string;
  object_key: string;
};

/** Prefer a derived preview object, then the original upload. Non-audio artifacts are ignored. */
export function pickPlaybackObjectKey(
  rows: readonly AudioObjectRef[] | null | undefined,
): string | null {
  if (!rows?.length) return null;
  const byKind = (kind: string) => rows.find((row) => row.kind === kind)?.object_key?.trim();
  return byKind("preview") || byKind("original") || null;
}

export function hasPlayableAudioObject(
  rows: readonly AudioObjectRef[] | null | undefined,
): boolean {
  return Boolean(pickPlaybackObjectKey(rows));
}
