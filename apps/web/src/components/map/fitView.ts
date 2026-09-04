export function fitTracksToView(
  tracks: { x: number; y: number }[],
  width: number,
  height: number,
  padding = 110,
): { target: [number, number, number]; zoom: number } {
  if (!tracks.length || width < 8 || height < 8) {
    return { target: [0, 0, 0], zoom: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const track of tracks) {
    if (track.x < minX) minX = track.x;
    if (track.x > maxX) maxX = track.x;
    if (track.y < minY) minY = track.y;
    if (track.y > maxY) maxY = track.y;
  }

  const spanX = Math.max(maxX - minX, 0.08);
  const spanY = Math.max(maxY - minY, 0.08);
  const availableW = Math.max(width - padding * 2, 8);
  const availableH = Math.max(height - padding * 2, 8);
  const zoom = Math.log2(Math.min(availableW / spanX, availableH / spanY));

  return {
    target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
    zoom,
  };
}
