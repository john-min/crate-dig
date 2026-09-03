/** Deterministic 2D PCA for a small embedding corpus. No extra deps. */

export function projectPca2d(
  vectors: ReadonlyMap<string, readonly number[]>,
): Map<string, { x: number; y: number }> {
  const ids = [...vectors.keys()].sort();
  const out = new Map<string, { x: number; y: number }>();
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { x: 0, y: 0 });
    return out;
  }

  const dim = vectors.get(ids[0]!)!.length;
  const mean = Array.from({ length: dim }, () => 0);
  for (const id of ids) {
    const values = vectors.get(id)!;
    for (let index = 0; index < dim; index += 1) mean[index]! += values[index]!;
  }
  for (let index = 0; index < dim; index += 1) mean[index]! /= ids.length;

  const centered = ids.map((id) => vectors.get(id)!.map((value, index) => value - mean[index]!));
  const cov = Array.from({ length: dim }, () => Array.from({ length: dim }, () => 0));
  const scale = 1 / Math.max(1, ids.length - 1);
  for (const row of centered) {
    for (let i = 0; i < dim; i += 1) {
      for (let j = i; j < dim; j += 1) {
        cov[i]![j]! += row[i]! * row[j]!;
      }
    }
  }
  for (let i = 0; i < dim; i += 1) {
    for (let j = i; j < dim; j += 1) {
      cov[i]![j]! *= scale;
      cov[j]![i] = cov[i]![j]!;
    }
  }

  const first = powerIterate(cov);
  const second = powerIterate(cov, first);
  for (let index = 0; index < ids.length; index += 1) {
    const row = centered[index]!;
    out.set(ids[index]!, { x: dot(row, first), y: dot(row, second) });
  }
  return out;
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index]! * right[index]!;
  return sum;
}

function powerIterate(matrix: readonly number[][], exclude?: readonly number[]): number[] {
  const dim = matrix.length;
  let vector = Array.from({ length: dim }, (_, index) => ((index * 17 + 3) % 97) / 97 - 0.5);
  if (exclude) vector = reject(vector, exclude);
  normalizeInPlace(vector);
  for (let step = 0; step < 24; step += 1) {
    const next = Array.from({ length: dim }, () => 0);
    for (let i = 0; i < dim; i += 1) {
      let sum = 0;
      for (let j = 0; j < dim; j += 1) sum += matrix[i]![j]! * vector[j]!;
      next[i] = sum;
    }
    if (exclude) rejectInPlace(next, exclude);
    normalizeInPlace(next);
    vector = next;
  }
  return vector;
}

function reject(vector: readonly number[], axis: readonly number[]): number[] {
  const scale = dot(vector, axis);
  return vector.map((value, index) => value - scale * axis[index]!);
}

function rejectInPlace(vector: number[], axis: readonly number[]): void {
  const scale = dot(vector, axis);
  for (let index = 0; index < vector.length; index += 1) vector[index]! -= scale * axis[index]!;
}

function normalizeInPlace(vector: number[]): void {
  const norm = Math.sqrt(dot(vector, vector)) || 1;
  for (let index = 0; index < vector.length; index += 1) vector[index]! /= norm;
}
