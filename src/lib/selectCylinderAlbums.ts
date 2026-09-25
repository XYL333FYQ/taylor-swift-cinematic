export const MAX_CYLINDER_ALBUMS = 12;

/** Selects a uniform random subset, then keeps the catalog's original order. */
export function selectCylinderAlbums<T>(
  albums: readonly T[],
  maxAlbums = MAX_CYLINDER_ALBUMS,
  random: () => number = Math.random,
): T[] {
  if (!Number.isInteger(maxAlbums) || maxAlbums < 0) {
    throw new RangeError('maxAlbums must be a non-negative integer.');
  }
  if (albums.length <= maxAlbums) return [...albums];

  const indices = albums.map((_, index) => index);
  for (let index = 0; index < maxAlbums; index += 1) {
    const selected = index + Math.floor(random() * (indices.length - index));
    [indices[index], indices[selected]] = [indices[selected]!, indices[index]!];
  }

  return indices
    .slice(0, maxAlbums)
    .sort((left, right) => left - right)
    .map((index) => albums[index]!);
}
